// Credenciales externas para la copia publica; Node.js 22.12 o posterior.
if (require('fs').existsSync(require('path').join(__dirname, '.env'))) process.loadEnvFile(require('path').join(__dirname, '.env'));
const express = require('express');
const multer = require('multer');
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const app = express();
const PORT = 3000;

// ==========================================
// DIRECTORIOS DE UPLOADS
// ==========================================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const manualesDir = path.join(__dirname, 'public', 'manuales');
if (!fs.existsSync(manualesDir)) {
    fs.mkdirSync(manualesDir, { recursive: true });
}

// ==========================================
// CONFIGURACIÓN MULTER — Archivos de tickets
// ==========================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

// ==========================================
// CONFIGURACIÓN MULTER — Manuales PDF
// ==========================================
const storageManual = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, manualesDir);
    },
    filename: function (req, file, cb) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9._\-áéíóúÁÉÍÓÚñÑ ]/g, '_');
        const uniqueSuffix = Date.now() + '-';
        cb(null, uniqueSuffix + safeName);
    }
});

const uploadManual = multer({
    storage: storageManual,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos PDF para manuales.'));
        }
    }
});

// ==========================================
// POOL MySQL
// ==========================================
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'clinica_app',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'clinica_incremento1',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const codigosRecuperacion = {};

// ==========================================
// NODEMAILER
// ==========================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASSWORD
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// MAPA DE ESTADOS
// ==========================================
const ESTADOS = {
    1: 'En curso',
    2: 'En espera',
    3: 'Cancelado',
    4: 'Resuelto',
    5: 'Pendiente'
};

// ==========================================
// VALIDACIÓN RUT MÓDULO 11 (backend)
// ==========================================
/**
 * Valida un RUT chileno usando el algoritmo Módulo 11.
 * Acepta el formato: 12345678-9  o  12345678-K
 * @param {string} rut - RUT con guión y dígito verificador
 * @returns {boolean}
 */
function validarRutModulo11(rut) {
    if (!rut || typeof rut !== 'string') return false;

    rut = rut.trim().toUpperCase();

    // Validar formato: solo dígitos, guión y dígito verificador (0-9 o K)
    if (!/^\d{7,8}-[\dK]$/.test(rut)) return false;

    const partes = rut.split('-');
    const cuerpo = partes[0];
    const dvIngresado = partes[1];

    let suma = 0;
    let multiplo = 2;

    for (let i = cuerpo.length - 1; i >= 0; i--) {
        suma += parseInt(cuerpo[i], 10) * multiplo;
        multiplo = multiplo === 7 ? 2 : multiplo + 1;
    }

    const resto = suma % 11;
    const dvCalc = 11 - resto;

    let dvEsperado;
    if (dvCalc === 11) dvEsperado = '0';
    else if (dvCalc === 10) dvEsperado = 'K';
    else dvEsperado = String(dvCalc);

    return dvIngresado === dvEsperado;
}

// ==========================================
// FUNCIONES AUXILIARES
// ==========================================
function enmascararCorreo(correo) {
    if (!correo || !correo.includes('@')) return correo;
    const [nombre, dominio] = correo.split('@');
    let enmascarado = '';
    if (nombre.length > 2) {
        enmascarado = nombre.substring(0, 2) + '*'.repeat(Math.min(nombre.length - 2, 4));
    } else {
        enmascarado = nombre[0] + '*';
    }
    return `${enmascarado}@${dominio}`;
}

async function asignarTecnico() {
    const [tecnicos] = await pool.query(`
        SELECT u.user_id, u.first_name
        FROM user u
        JOIN user_role ur ON u.user_id = ur.user_id
        WHERE ur.role_id = 1 AND ur.active = 1
    `);

    if (tecnicos.length === 0) return null;

    for (const tecnico of tecnicos) {
        const [activos] = await pool.query(`
            SELECT COUNT(*) as total FROM ticket
            WHERE assigned_user_id = ? AND status_id IN (1, 2, 5)
        `, [tecnico.user_id]);

        if (activos[0].total === 0) {
            return tecnico;
        }
    }

    const [resultado] = await pool.query(`
        SELECT t.assigned_user_id as user_id, u.first_name, MIN(t.creation_date) as ticket_mas_antiguo
        FROM ticket t
        JOIN user u ON t.assigned_user_id = u.user_id
        WHERE t.assigned_user_id IN (
            SELECT u2.user_id FROM user u2
            JOIN user_role ur2 ON u2.user_id = ur2.user_id
            WHERE ur2.role_id = 1 AND ur2.active = 1
        )
        AND t.status_id IN (1, 2, 5)
        GROUP BY t.assigned_user_id, u.first_name
        ORDER BY ticket_mas_antiguo ASC
        LIMIT 1
    `);

    if (resultado.length > 0) return resultado[0];
    return tecnicos[0];
}

function textoEstado(estadoAnteriorId, estadoNuevoId, nombreUsuario) {
    const anterior = ESTADOS[estadoAnteriorId] || `Estado ${estadoAnteriorId}`;
    const nuevo = ESTADOS[estadoNuevoId] || `Estado ${estadoNuevoId}`;
    return `📋 Cambio de estado: "${anterior}" → "${nuevo}" por ${nombreUsuario}.`;
}

// ==========================================
// NOTIFICACIONES AL CREADOR (solo en panel)
// ==========================================
async function marcarNotificacionCreador(ticketId, requesterUserId, actorUserId) {
    try {
        if (requesterUserId && actorUserId && requesterUserId !== actorUserId) {
            await pool.query('UPDATE ticket SET notify_creator = 1 WHERE ticket_id = ?', [ticketId]);
        }
    } catch (error) {
        console.error('Error marcando notificación al creador:', error);
    }
}

// ==========================================
// HELPER: Construir ticket desde fila DB
// ==========================================
async function buildTicketFromRow(ticket) {
    if (ticket.estado === 'Cerrado') ticket.estado = 'Resuelto';

    if (ticket.title && ticket.title.startsWith('Incidente en ')) {
        const ubicacion = ticket.title.replace('Incidente en ', '').split(' - ');
        ticket.piso = ubicacion[0] ? ubicacion[0].trim() : 'S/I';
        ticket.habitacion = ubicacion[1] ? ubicacion[1].trim() : (ticket.habitacion_original || 'S/I');
    } else {
        ticket.piso = 'S/I';
        ticket.habitacion = ticket.habitacion_original || 'S/I';
    }

    const [comments] = await pool.query(`
        SELECT c.content as texto, DATE_FORMAT(c.comment_date, '%d/%m/%Y, %H:%i:%s') as fecha, u.first_name as usuario
        FROM comment c LEFT JOIN user u ON c.user_id = u.user_id
        WHERE c.ticket_id = ? ORDER BY c.comment_date DESC
    `, [ticket.ticket_id]);
    ticket.comentarios = JSON.stringify(comments);

    return ticket;
}

// ==========================================
// FUNCIONES DE EMAIL
// ==========================================
function enviarEmailNuevoTicket(destinatarios, ticketData) {
    if (!destinatarios || destinatarios.trim() === '') return;

    const { ticketCode, creador, piso, habitacion, aparato, descripcion, fecha, tecnicoAsignado } = ticketData;

    const textoPlano = `Se ha generado un nuevo ticket en el sistema.\n\nDetalles del Incidente:\nID: ${ticketCode}\nCreador: ${creador}\nUbicación: ${piso} - ${habitacion}\nAparato: ${aparato}\nDescripción: ${descripcion}\nFecha: ${fecha}\nTécnico asignado: ${tecnicoAsignado || 'Sin asignar'}\n\nPor favor, revisa el panel para tomar acción.`;

    const htmlEmail = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background-color:#f0f4f8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#2c3e50; padding: 25px 30px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:20px; letter-spacing:1px;">🚨 Nuevo Incidente Reportado</h1>
              <p style="margin:8px 0 0 0; color:#a0b0c0; font-size:13px;">Ticketera Clínica Aconcagua</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 25px 30px 10px 30px;">
              <p style="margin:0; color:#555; font-size:15px;">Se ha generado un nuevo ticket en el sistema.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 15px 30px 25px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e6ed; border-radius:6px; overflow:hidden;">
                <tr>
                  <td colspan="2" style="background-color:#3d5a80; padding:12px 18px;">
                    <span style="color:#ffffff; font-weight:bold; font-size:14px;">Detalles del Incidente</span>
                  </td>
                </tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; width:35%; border-bottom:1px solid #eef1f5;">ID</td><td style="padding:11px 18px; color:#222; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">${ticketCode}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Creador</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${creador}</td></tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Ubicación</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${piso} - ${habitacion}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Aparato</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${aparato}</td></tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Descripción</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${descripcion}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Fecha</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${fecha}</td></tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold;">Técnico Asignado</td><td style="padding:11px 18px; color:#3d5a80; font-size:13px; font-weight:bold;">${tecnicoAsignado || 'Sin asignar'}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 30px 30px 30px; text-align:center;">
              <p style="color:#555; font-size:14px; margin:0 0 15px 0;">Por favor, revisa el panel para tomar acción.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f0f4f8; padding:18px 30px; text-align:center; border-top:1px solid #e0e6ed;">
              <p style="margin:0; color:#aaa; font-size:12px;">Mensaje automático — Ticketera Clínica Aconcagua</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    transporter.sendMail({
        from: '"Panel de Operaciones" <clinicaaconcagua30@gmail.com>',
        to: destinatarios,
        subject: `🚨 Nuevo Incidente Reportado: ${ticketCode}`,
        text: textoPlano,
        html: htmlEmail
    }, (error) => {
        if (error) console.error('Error enviando email nuevo ticket:', error);
    });
}

function enviarEmailTicketResuelto(destinatario, ticketData) {
    if (!destinatario || destinatario.trim() === '' || destinatario.includes('@temp.com')) return;

    const { ticketCode, creador, aparato, descripcion, fechaCreacion, fechaResolucion, tecnico, resolucion } = ticketData;

    const htmlEmail = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background-color:#f0f4f8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#27ae60; padding: 25px 30px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:20px; letter-spacing:1px;">✅ Ticket Resuelto</h1>
              <p style="margin:8px 0 0 0; color:#d5f5e3; font-size:13px;">Ticketera Clínica Aconcagua</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 25px 30px 10px 30px;">
              <p style="margin:0; color:#555; font-size:15px;">Hola <strong>${creador}</strong>, tu incidente ha sido marcado como <strong>resuelto</strong>.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 15px 30px 25px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e6ed; border-radius:6px; overflow:hidden;">
                <tr>
                  <td colspan="2" style="background-color:#27ae60; padding:12px 18px;">
                    <span style="color:#ffffff; font-weight:bold; font-size:14px;">Resumen del Ticket</span>
                  </td>
                </tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; width:35%; border-bottom:1px solid #eef1f5;">ID</td><td style="padding:11px 18px; color:#222; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">${ticketCode}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Aparato</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${aparato}</td></tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Descripción</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${descripcion}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Fecha apertura</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${fechaCreacion}</td></tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Fecha resolución</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${fechaResolucion}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Técnico</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${tecnico}</td></tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold;">Resolución</td><td style="padding:11px 18px; color:#27ae60; font-size:13px; font-weight:bold;">${resolucion}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f0f4f8; padding:18px 30px; text-align:center; border-top:1px solid #e0e6ed;">
              <p style="margin:0; color:#aaa; font-size:12px;">Mensaje automático — Ticketera Clínica Aconcagua</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    transporter.sendMail({
        from: '"Panel de Operaciones" <clinicaaconcagua30@gmail.com>',
        to: destinatario,
        subject: `✅ Tu ticket ${ticketCode} ha sido resuelto`,
        html: htmlEmail
    }, (error) => {
        if (error) console.error('Error enviando email resolución:', error);
    });
}

function enviarNotificacionAdminDerivado(destinatario, ticketData) {
    if (!destinatario || destinatario.trim() === '' || destinatario.includes('@temp.com')) return;

    const { ticketCode, creador, aparato, descripcion, fecha, tecnicoAsignado } = ticketData;

    const htmlEmail = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0; padding:0; background-color:#f0f4f8; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8; padding: 30px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background-color:#8e44ad; padding: 25px 30px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:20px; letter-spacing:1px;">🔔 Ticket Derivado a tu Equipo</h1>
              <p style="margin:8px 0 0 0; color:#e8d5f5; font-size:13px;">Ticketera Clínica Aconcagua</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 25px 30px 10px 30px;">
              <p style="margin:0; color:#555; font-size:15px;">Se ha derivado un nuevo incidente que requiere tu atención como administrador.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 15px 30px 25px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e0e6ed; border-radius:6px; overflow:hidden;">
                <tr>
                  <td colspan="2" style="background-color:#8e44ad; padding:12px 18px;">
                    <span style="color:#ffffff; font-weight:bold; font-size:14px;">Detalles del Incidente Derivado</span>
                  </td>
                </tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; width:35%; border-bottom:1px solid #eef1f5;">ID</td><td style="padding:11px 18px; color:#222; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">${ticketCode}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Reportado por</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${creador}</td></tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Aparato</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${aparato}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Descripción</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${descripcion}</td></tr>
                <tr style="background-color:#f8fafc;"><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold; border-bottom:1px solid #eef1f5;">Fecha</td><td style="padding:11px 18px; color:#333; font-size:13px; border-bottom:1px solid #eef1f5;">${fecha}</td></tr>
                <tr><td style="padding:11px 18px; color:#888; font-size:13px; font-weight:bold;">Técnico asignado</td><td style="padding:11px 18px; color:#8e44ad; font-size:13px; font-weight:bold;">${tecnicoAsignado}</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 30px 25px 30px; text-align:center;">
              <p style="color:#555; font-size:14px; margin:0;">Accede al panel para hacer seguimiento de este incidente.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f0f4f8; padding:18px 30px; text-align:center; border-top:1px solid #e0e6ed;">
              <p style="margin:0; color:#aaa; font-size:12px;">Mensaje automático — Ticketera Clínica Aconcagua</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    transporter.sendMail({
        from: '"Panel de Operaciones" <clinicaaconcagua30@gmail.com>',
        to: destinatario,
        subject: `🔔 Ticket derivado: ${ticketCode}`,
        html: htmlEmail
    }, (error) => {
        if (error) console.error('Error enviando notificación admin derivado:', error);
    });
}

// ==========================================
// RUTAS — AUTH
// ==========================================

app.post('/registro', async (req, res) => {
    const { nombre, rut, correo, password } = req.body;

    // Validación módulo 11 (backend) — nunca confiar solo en el frontend
    if (!validarRutModulo11(rut)) {
        return res.status(400).json({ error: 'RUT inválido', rutValido: false });
    }

    try {
        const [existing] = await pool.query('SELECT * FROM user WHERE rut = ?', [rut]);
        if (existing.length > 0) return res.status(400).json({ error: 'El RUT ya está registrado.' });

        const correoFinal = (correo && correo.trim() !== '') ? correo : `sin_correo_${Date.now()}@temp.com`;

        const [result] = await pool.query(
            `INSERT INTO user (first_name, first_last_name, second_last_name, institutional_email, rut, username, password_hash)
             VALUES (?, '', '', ?, ?, ?, ?)`,
            [nombre, correoFinal, rut, rut, password]
        );

        await pool.query(`INSERT INTO user_role (assignment_date, active, role_id, user_id) VALUES (NOW(), 1, 2, ?)`, [result.insertId]);

        res.json({ success: true, message: 'Usuario generado con exito' });
    } catch (error) {
        console.error("ERROR EN REGISTRO:", error);
        res.status(500).json({ error: 'Error en la base de datos' });
    }
});

// ==========================================
// VALIDAR RUT (solo validación, sin registrar)
// Devuelve: { valido: true,  mensaje: "RUT válido"   }
//           { valido: false, mensaje: "RUT inválido" }
// ==========================================
app.post('/validar-rut', (req, res) => {
    const { rut } = req.body;

    if (!rut || rut.trim() === '') {
        return res.status(400).json({ valido: false, mensaje: 'Debes ingresar un RUT.' });
    }

    const esValido = validarRutModulo11(rut.trim());

    if (esValido) {
        return res.json({ valido: true, mensaje: 'RUT válido' });
    } else {
        return res.json({ valido: false, mensaje: 'RUT inválido' });
    }
});

app.post('/login', async (req, res) => {
    const { rut, password } = req.body;

    if (!/^\d{7,9}-[\dkK]$/.test(rut)) return res.status(400).json({ error: 'rut invalido' });

    try {
        const [users] = await pool.query(
            `SELECT u.*, r.role_name
             FROM user u
             LEFT JOIN user_role ur ON u.user_id = ur.user_id
             LEFT JOIN role r ON ur.role_id = r.role_id
             WHERE u.rut = ? AND u.password_hash = ?`,
            [rut, password]
        );

        if (users.length > 0) {
            const usuario = users[0];
            const permisos = usuario.role_name === 'Admin' ? 'si' : 'no';
            const correoMostrar = usuario.institutional_email.includes('@temp.com') ? '' : usuario.institutional_email;

            const nuevoToken = crypto.randomBytes(32).toString('hex');
            await pool.query('UPDATE user SET session_token = ? WHERE user_id = ?', [nuevoToken, usuario.user_id]);

            res.json({
                success: true,
                message: `Bienvenido, ${usuario.first_name}!`,
                nombre: usuario.first_name,
                permisos: permisos,
                rut: usuario.rut,
                correo: correoMostrar,
                token: nuevoToken
            });
        } else {
            res.status(401).json({ error: 'Contraseña incorrecta o usuario no encontrado.' });
        }
    } catch (error) {
        console.error("ERROR EN LOGIN:", error);
        res.status(500).json({ error: 'Error en la base de datos' });
    }
});

app.post('/sesion/verificar', async (req, res) => {
    const { rut, token } = req.body;
    if (!rut || !token) return res.json({ valida: false });

    try {
        const [users] = await pool.query('SELECT session_token FROM user WHERE rut = ?', [rut]);
        if (users.length === 0) return res.json({ valida: false });

        const tokenActual = users[0].session_token;
        const valida = (tokenActual !== null && tokenActual === token);
        res.json({ valida });
    } catch (error) {
        console.error("ERROR VERIFICANDO SESION:", error);
        res.json({ valida: true });
    }
});

app.post('/sesion/cerrar', async (req, res) => {
    const { rut, token } = req.body;
    if (!rut || !token) return res.json({ success: true });

    try {
        await pool.query(
            'UPDATE user SET session_token = NULL WHERE rut = ? AND session_token = ?',
            [rut, token]
        );
        res.json({ success: true });
    } catch (error) {
        console.error("ERROR CERRANDO SESION:", error);
        res.json({ success: true });
    }
});

// ==========================================
// RECUPERAR CONTRASEÑA
// ==========================================
app.post('/recuperar-solicitar', async (req, res) => {
    const { rut } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM user WHERE rut = ?', [rut]);
        if (users.length === 0) return res.status(404).json({ error: 'No existe un usuario asociado a este RUT.' });

        const usuario = users[0];
        if (!usuario.institutional_email || usuario.institutional_email.includes('@temp.com')) {
            return res.status(400).json({ error: 'Esta cuenta no tiene un correo asociado.' });
        }

        const codigoGenerado = Math.floor(100000 + Math.random() * 900000).toString();
        codigosRecuperacion[rut] = codigoGenerado;

        const correoHint = enmascararCorreo(usuario.institutional_email);

        transporter.sendMail({
            from: '"Ticketera Clínica Aconcagua" <clinicaaconcagua30@gmail.com>',
            to: usuario.institutional_email,
            subject: `🔑 Código de Recuperación de Contraseña`,
            text: `Hola ${usuario.first_name},\n\nTu código de verificación es: ${codigoGenerado}`
        }, (error) => {
            if (error) return res.status(500).json({ error: 'Error al enviar el correo.' });
            res.json({ success: true, message: 'Código enviado.', correoHint });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error en la base de datos' });
    }
});

app.post('/recuperar-verificar', (req, res) => {
    const { rut, codigo } = req.body;

    if (!rut || !codigo) {
        return res.status(400).json({ error: 'Faltan datos para verificar el código.' });
    }

    const codigoGuardado = codigosRecuperacion[rut];

    if (!codigoGuardado) {
        return res.status(400).json({ error: 'No hay un código de recuperación activo para este usuario. Solicítalo nuevamente.' });
    }

    if (String(codigoGuardado) !== String(codigo).trim()) {
        return res.status(400).json({ error: 'Código incorrecto.' });
    }

    res.json({ success: true, message: 'Código verificado correctamente.' });
});

app.post('/recuperar-cambiar', async (req, res) => {
    const { rut, codigo, nuevaPassword } = req.body;
    if (!codigosRecuperacion[rut] || codigosRecuperacion[rut] !== codigo) {
        return res.status(400).json({ error: 'Código incorrecto o expirado.' });
    }
    try {
        await pool.query('UPDATE user SET password_hash = ? WHERE rut = ?', [nuevaPassword, rut]);
        delete codigosRecuperacion[rut];
        res.json({ success: true, message: 'Contraseña actualizada.' });
    } catch (error) {
        res.status(500).json({ error: 'Error en la base de datos' });
    }
});

// ==========================================
// EDITAR PERFIL
// ==========================================
app.post('/editar-perfil', async (req, res) => {
    const { rut, nombre, correo, passwordActual, passwordNueva, codigo } = req.body;
    try {
        const [users] = await pool.query('SELECT * FROM user WHERE rut = ?', [rut]);
        if (users.length === 0) return res.status(404).json({ error: 'Usuario no encontrado.' });
        const usuario = users[0];

        if (passwordNueva && passwordNueva.trim() !== '') {
            if (codigo && codigo.trim() !== '') {
                if (!codigosRecuperacion[rut] || codigosRecuperacion[rut] !== codigo) {
                    return res.status(400).json({ error: 'Código incorrecto o expirado.' });
                }
                delete codigosRecuperacion[rut];
            } else if (passwordActual && passwordActual.trim() !== '') {
                if (usuario.password_hash !== passwordActual) return res.status(400).json({ error: 'Contraseña actual incorrecta.' });
            } else {
                return res.status(400).json({ error: 'Proporciona la contraseña actual o un código.' });
            }
            await pool.query('UPDATE user SET password_hash = ? WHERE rut = ?', [passwordNueva, rut]);
        }

        const correoFinal = (correo && correo.trim() !== '') ? correo : `sin_correo_${Date.now()}@temp.com`;
        await pool.query('UPDATE user SET first_name = ?, institutional_email = ? WHERE rut = ?', [nombre, correoFinal, rut]);
        res.json({ success: true, message: 'Perfil actualizado.' });
    } catch (error) {
        res.status(500).json({ error: 'Error en la base de datos' });
    }
});

// ==========================================
// GET /incidentes
// Devuelve SOLO tickets ACTIVOS (Pendiente / En curso / En espera)
// Para todos los usuarios (el frontend filtra por permisos para mostrar)
// ==========================================
app.get('/incidentes', async (req, res) => {
    try {
        const query = `
            SELECT
                t.ticket_id,
                t.ticket_code as id_ticket,
                u.first_name as creador,
                DATE_FORMAT(t.creation_date, '%d/%m/%Y, %H:%i:%s') as fecha,
                t.description as descripcion,
                t.title,
                s.status_name as estado,
                e.equipment_name as aparato,
                e.location as habitacion_original,
                t.assigned_user_id,
                au.first_name as tecnico_asignado,
                t.notify_creator as notificacion_creador
            FROM ticket t
            LEFT JOIN user u ON t.requester_user_id = u.user_id
            LEFT JOIN status s ON t.status_id = s.status_id
            LEFT JOIN equipment e ON t.equipment_id = e.equipment_id
            LEFT JOIN user au ON t.assigned_user_id = au.user_id
            WHERE t.status_id IN (1, 2, 5)
            ORDER BY t.ticket_id DESC
        `;

        const [tickets] = await pool.query(query);

        for (let ticket of tickets) {
            await buildTicketFromRow(ticket);
        }

        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error obteniendo incidentes' });
    }
});

// ==========================================
// GET /incidentes/cerrados
// Devuelve TODOS los tickets cerrados (Resuelto / Cancelado) desde la BD.
// Admin: todos. Usuario normal: solo los suyos.
// ==========================================
app.get('/incidentes/cerrados', async (req, res) => {
    const { usuario, esAdmin } = req.query;
    const esAdminBool = esAdmin === 'si';

    try {
        let query = `
            SELECT
                t.ticket_id,
                t.ticket_code as id_ticket,
                u.first_name as creador,
                DATE_FORMAT(t.creation_date, '%d/%m/%Y, %H:%i:%s') as fecha,
                t.description as descripcion,
                t.title,
                s.status_name as estado,
                e.equipment_name as aparato,
                e.location as habitacion_original,
                t.assigned_user_id,
                au.first_name as tecnico_asignado,
                t.notify_creator as notificacion_creador
            FROM ticket t
            LEFT JOIN user u ON t.requester_user_id = u.user_id
            LEFT JOIN status s ON t.status_id = s.status_id
            LEFT JOIN equipment e ON t.equipment_id = e.equipment_id
            LEFT JOIN user au ON t.assigned_user_id = au.user_id
            WHERE t.status_id IN (3, 4)
        `;

        const params = [];

        if (!esAdminBool) {
            query += ` AND u.first_name = ?`;
            params.push(usuario || '');
        }

        query += ` ORDER BY t.ticket_id DESC`;

        const [tickets] = await pool.query(query, params);

        for (let ticket of tickets) {
            await buildTicketFromRow(ticket);
        }

        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error obteniendo historial' });
    }
});

// ==========================================
// GET /incidentes/buscar
// Búsqueda en TODOS los tickets activos desde la BD.
// ==========================================
app.get('/incidentes/buscar', async (req, res) => {
    const { q } = req.query;
    if (!q || q.trim() === '') return res.json([]);

    const termino = `%${q.trim()}%`;

    try {
        const query = `
            SELECT
                t.ticket_id,
                t.ticket_code as id_ticket,
                u.first_name as creador,
                DATE_FORMAT(t.creation_date, '%d/%m/%Y, %H:%i:%s') as fecha,
                t.description as descripcion,
                t.title,
                s.status_name as estado,
                e.equipment_name as aparato,
                e.location as habitacion_original,
                t.assigned_user_id,
                au.first_name as tecnico_asignado,
                t.notify_creator as notificacion_creador
            FROM ticket t
            LEFT JOIN user u ON t.requester_user_id = u.user_id
            LEFT JOIN status s ON t.status_id = s.status_id
            LEFT JOIN equipment e ON t.equipment_id = e.equipment_id
            LEFT JOIN user au ON t.assigned_user_id = au.user_id
            WHERE t.status_id IN (1, 2, 5)
              AND (
                t.ticket_code LIKE ? OR
                u.first_name LIKE ? OR
                e.equipment_name LIKE ? OR
                t.description LIKE ?
              )
            ORDER BY t.ticket_id DESC
        `;

        const [tickets] = await pool.query(query, [termino, termino, termino, termino]);

        for (let ticket of tickets) {
            await buildTicketFromRow(ticket);
        }

        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error en búsqueda' });
    }
});

// ==========================================
// GET /estadisticas
// ==========================================
app.get('/estadisticas', async (req, res) => {
    try {
        const [ticketsTotales] = await pool.query(`
            SELECT
                t.title,
                s.status_name as estado,
                e.equipment_name as aparato,
                u.first_name as creador,
                DATE_FORMAT(t.creation_date, '%Y-%m-%d') as fecha_dia,
                YEARWEEK(t.creation_date, 1) as semana
            FROM ticket t
            LEFT JOIN status s ON t.status_id = s.status_id
            LEFT JOIN equipment e ON t.equipment_id = e.equipment_id
            LEFT JOIN user u ON t.requester_user_id = u.user_id
        `);

        const porAparato = {};
        const porCreador = {};
        const porEstado  = {};
        const porPiso    = {};
        const porSemana  = {};

        const estadoNormalizar = (e) => e === 'Cerrado' ? 'Resuelto' : (e || 'En curso');

        ticketsTotales.forEach(t => {
            const estado = estadoNormalizar(t.estado);

            const ap = t.aparato || 'Desconocido';
            porAparato[ap] = (porAparato[ap] || 0) + 1;

            const cr = t.creador || 'Anónimo';
            porCreador[cr] = (porCreador[cr] || 0) + 1;

            porEstado[estado] = (porEstado[estado] || 0) + 1;

            let piso = 'Sin info';
            if (t.title && t.title.startsWith('Incidente en ')) {
                const partes = t.title.replace('Incidente en ', '').split(' - ');
                piso = partes[0] ? partes[0].trim() : 'Sin info';
            }
            porPiso[piso] = (porPiso[piso] || 0) + 1;

            if (estado === 'Resuelto' && t.semana) {
                porSemana[t.semana] = (porSemana[t.semana] || 0) + 1;
            }
        });

        const semanasOrdenadas = Object.entries(porSemana)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-8);

        res.json({
            porAparato,
            porCreador,
            porEstado,
            porPiso,
            semanasResueltas: semanasOrdenadas.map(([semana, total]) => ({
                semana: `Sem. ${semana.slice(4)}/${semana.slice(0, 4)}`,
                total
            }))
        });
    } catch (error) {
        console.error('Error estadísticas:', error);
        res.status(500).json({ error: 'Error obteniendo estadísticas' });
    }
});

// ==========================================
// POST /incidente/ver
// ==========================================
app.post('/incidente/ver', async (req, res) => {
    const { id_ticket, usuario } = req.body;
    try {
        const [tickets] = await pool.query(
            `SELECT t.ticket_id, t.status_id, t.notify_creator,
                    au.first_name as tecnico_nombre,
                    cu.first_name as creador_nombre
             FROM ticket t
             LEFT JOIN user au ON t.assigned_user_id = au.user_id
             LEFT JOIN user cu ON t.requester_user_id = cu.user_id
             WHERE t.ticket_code = ?`,
            [id_ticket]
        );
        if (tickets.length === 0) return res.json({ cambio: false, notifLimpiada: false });

        const ticket = tickets[0];
        let cambio = false;
        let nuevoEstado = null;
        let notifLimpiada = false;

        if (ticket.status_id === 5 && ticket.tecnico_nombre === usuario) {
            await pool.query('UPDATE ticket SET status_id = 1 WHERE ticket_id = ?', [ticket.ticket_id]);

            const [users] = await pool.query('SELECT user_id FROM user WHERE first_name = ? LIMIT 1', [usuario]);
            const userId = users.length > 0 ? users[0].user_id : 1;

            const comentarioCambio = textoEstado(5, 1, usuario);
            await pool.query(
                'INSERT INTO comment (content, user_id, ticket_id) VALUES (?, ?, ?)',
                [comentarioCambio, userId, ticket.ticket_id]
            );

            cambio = true;
            nuevoEstado = 'En curso';
        }

        if (ticket.notify_creator === 1 && ticket.creador_nombre === usuario) {
            await pool.query('UPDATE ticket SET notify_creator = 0 WHERE ticket_id = ?', [ticket.ticket_id]);
            notifLimpiada = true;
        }

        res.json({ cambio, nuevoEstado, notifLimpiada });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error procesando vista' });
    }
});

// ==========================================
// POST /incidente
// ==========================================
app.post('/incidente', async (req, res) => {
    const { creador, piso, habitacion, aparato, descripcion } = req.body;
    try {
        const [users] = await pool.query('SELECT user_id FROM user WHERE first_name = ? LIMIT 1', [creador]);
        const userId = users.length > 0 ? users[0].user_id : 1;

        const [equipos] = await pool.query('SELECT equipment_id FROM equipment WHERE equipment_name = ? LIMIT 1', [aparato]);
        const equipId = equipos.length > 0 ? equipos[0].equipment_id : 1;

const [rows] = await pool.query(
    `SELECT MAX(CAST(SUBSTRING(ticket_code, 4) AS UNSIGNED)) as maxCode FROM ticket WHERE ticket_code LIKE 'INC%'`
);
const nextId = (rows[0].maxCode || 0) + 1;
const ticketCode = "INC" + String(nextId).padStart(7, '0');     

        const tecnico = await asignarTecnico();
        const tecnicoId = tecnico ? tecnico.user_id : null;
        const tecnicoNombre = tecnico ? tecnico.first_name : 'Sin asignar';

        await pool.query(`
            INSERT INTO ticket (ticket_code, title, description, ticket_origin, requester_user_id, category_id, status_id, priority_id, equipment_id, assigned_user_id)
            VALUES (?, ?, ?, 'web', ?, 1, 5, 1, ?, ?)
        `, [ticketCode, `Incidente en ${piso} - ${habitacion}`, descripcion, userId, equipId, tecnicoId]);

        const ahora = new Date();
        const fechaFormateada = ahora.toLocaleDateString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        const ticketDataEmail = {
            ticketCode,
            creador,
            piso,
            habitacion,
            aparato,
            descripcion,
            fecha: fechaFormateada,
            tecnicoAsignado: tecnicoNombre
        };

        const [admins] = await pool.query(`
            SELECT u.institutional_email FROM user u JOIN user_role ur ON u.user_id = ur.user_id
            JOIN role r ON ur.role_id = r.role_id WHERE r.role_name = 'Admin' AND u.institutional_email NOT LIKE '%@temp.com'
        `);

        const correosAdmins = admins.map(a => a.institutional_email).join(', ');
        enviarEmailNuevoTicket(correosAdmins, ticketDataEmail);

        for (const admin of admins) {
            enviarNotificacionAdminDerivado(admin.institutional_email, ticketDataEmail);
        }

        res.json({ success: true, message: `¡Ticket ${ticketCode} generado con éxito! Asignado a: ${tecnicoNombre}` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error creando ticket' });
    }
});

// ==========================================
// POST /incidente/comentar
// ==========================================
const uploadMiddleware = upload.single('archivo');

app.post('/incidente/comentar', (req, res) => {
    uploadMiddleware(req, res, async function (err) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'El archivo excede el límite de 10 MB.' });
            }
            return res.status(500).json({ error: err.message });
        } else if (err) {
            return res.status(500).json({ error: 'Error al subir el archivo.' });
        }

        const { id_ticket, usuario, texto } = req.body;
        const file = req.file;

        try {
            const [tickets] = await pool.query('SELECT ticket_id, requester_user_id FROM ticket WHERE ticket_code = ?', [id_ticket]);
            if (tickets.length === 0) return res.status(404).json({ error: 'Ticket no encontrado' });
            const ticketId = tickets[0].ticket_id;
            const requesterUserId = tickets[0].requester_user_id;

            const [users] = await pool.query('SELECT user_id FROM user WHERE first_name = ? LIMIT 1', [usuario]);
            const userId = users.length > 0 ? users[0].user_id : 1;

            let comentarioFinal = texto || '';

            if (file) {
                const filePath = '/uploads/' + file.filename;
                const fileSizeMb = (file.size / (1024 * 1024)).toFixed(2);

                await pool.query(
                    'INSERT INTO attachment (file_name, file_path, mime_type, file_size_mb, upload_by_user_id, ticket_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [file.originalname, filePath, file.mimetype, fileSizeMb, userId, ticketId]
                );

                let fileHtml = `<a href="${filePath}" target="_blank" style="color: #007bff; font-weight: bold; text-decoration: underline;">📎 Descargar: ${file.originalname}</a>`;

                if (file.mimetype.startsWith('image/')) {
                    fileHtml += `<br><img src="${filePath}" style="max-width: 100%; max-height: 250px; margin-top: 10px; border-radius: 6px; border: 1px solid #ccc;">`;
                }

                if (comentarioFinal !== '') comentarioFinal += '\n\n';
                comentarioFinal += fileHtml;
            }

            await pool.query('INSERT INTO comment (content, user_id, ticket_id) VALUES (?, ?, ?)', [comentarioFinal, userId, ticketId]);

            await marcarNotificacionCreador(ticketId, requesterUserId, userId);

            const [comments] = await pool.query(`
                SELECT c.content as texto, DATE_FORMAT(c.comment_date, '%d/%m/%Y, %H:%i:%s') as fecha, u.first_name as usuario
                FROM comment c LEFT JOIN user u ON c.user_id = u.user_id WHERE c.ticket_id = ? ORDER BY c.comment_date DESC
            `, [ticketId]);

            res.json({ success: true, comentarios: comments });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Error procesando comentario' });
        }
    });
});

// ==========================================
// HELPER: Procesar acción de ticket
// ==========================================
async function procesarAccionTicket(ticketCode, usuarioNombre, estadoAnteriorId, nuevoEstadoId, comentarioTexto, res) {
    try {
        const [tickets] = await pool.query('SELECT ticket_id, status_id, requester_user_id FROM ticket WHERE ticket_code = ?', [ticketCode]);
        if (tickets.length === 0) return res.status(404).json({ error: 'Ticket no encontrado' });
        const ticketId = tickets[0].ticket_id;
        const estadoPrevio = estadoAnteriorId || tickets[0].status_id;
        const requesterUserId = tickets[0].requester_user_id;

        const [users] = await pool.query('SELECT user_id FROM user WHERE first_name = ? LIMIT 1', [usuarioNombre]);
        const userId = users.length > 0 ? users[0].user_id : 1;

        if (nuevoEstadoId) {
            await pool.query('UPDATE ticket SET status_id = ? WHERE ticket_id = ?', [nuevoEstadoId, ticketId]);
        }

        await pool.query('INSERT INTO comment (content, user_id, ticket_id) VALUES (?, ?, ?)', [comentarioTexto, userId, ticketId]);

        if (nuevoEstadoId && nuevoEstadoId !== estadoPrevio) {
            const bitacora = textoEstado(estadoPrevio, nuevoEstadoId, usuarioNombre);
            await pool.query('INSERT INTO comment (content, user_id, ticket_id) VALUES (?, ?, ?)', [bitacora, userId, ticketId]);
        }

        await marcarNotificacionCreador(ticketId, requesterUserId, userId);

        const [comments] = await pool.query(`
            SELECT c.content as texto, DATE_FORMAT(c.comment_date, '%d/%m/%Y, %H:%i:%s') as fecha, u.first_name as usuario
            FROM comment c LEFT JOIN user u ON c.user_id = u.user_id WHERE c.ticket_id = ? ORDER BY c.comment_date DESC
        `, [ticketId]);

        res.json({ success: true, comentarios: comments });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error procesando acción' });
    }
}

// ==========================================
// ACCIONES DE TICKETS
// ==========================================
app.post('/incidente/espera', (req, res) => {
    const { id_ticket, usuario, info_espera } = req.body;
    procesarAccionTicket(id_ticket, usuario, null, 2, `⏸️ TICKET EN ESPERA.\nMotivo: ${info_espera}`, res);
});

app.post('/incidente/continuar', (req, res) => {
    const { id_ticket, usuario } = req.body;
    procesarAccionTicket(id_ticket, usuario, null, 1, `▶️ TICKET RETOMADO.`, res);
});

app.post('/incidente/cancelar', (req, res) => {
    const { id_ticket, usuario, info_cancelar } = req.body;
    procesarAccionTicket(id_ticket, usuario, null, 3, `🚫 TICKET CANCELADO.\nMotivo: ${info_cancelar}`, res);
});

app.post('/incidente/resolver', async (req, res) => {
    const { id_ticket, usuario, info_resolucion } = req.body;

    try {
        const [tickets] = await pool.query(`
            SELECT
                t.ticket_id, t.status_id, t.description, t.requester_user_id,
                DATE_FORMAT(t.creation_date, '%d/%m/%Y, %H:%i:%s') as fecha_creacion,
                u_creador.first_name as creador_nombre,
                u_creador.institutional_email as creador_email,
                e.equipment_name as aparato,
                u_tecnico.first_name as tecnico_nombre
            FROM ticket t
            LEFT JOIN user u_creador ON t.requester_user_id = u_creador.user_id
            LEFT JOIN user u_tecnico ON t.assigned_user_id = u_tecnico.user_id
            LEFT JOIN equipment e ON t.equipment_id = e.equipment_id
            WHERE t.ticket_code = ?
        `, [id_ticket]);

        if (tickets.length === 0) return res.status(404).json({ error: 'Ticket no encontrado' });
        const ticket = tickets[0];

        const [users] = await pool.query('SELECT user_id FROM user WHERE first_name = ? LIMIT 1', [usuario]);
        const userId = users.length > 0 ? users[0].user_id : 1;

        const estadoPrevio = ticket.status_id;

        await pool.query('UPDATE ticket SET status_id = 4 WHERE ticket_id = ?', [ticket.ticket_id]);

        await pool.query(
            'INSERT INTO comment (content, user_id, ticket_id) VALUES (?, ?, ?)',
            [`✅ TICKET RESUELTO.\nResolución: ${info_resolucion}`, userId, ticket.ticket_id]
        );

        const bitacora = textoEstado(estadoPrevio, 4, usuario);
        await pool.query(
            'INSERT INTO comment (content, user_id, ticket_id) VALUES (?, ?, ?)',
            [bitacora, userId, ticket.ticket_id]
        );

        await marcarNotificacionCreador(ticket.ticket_id, ticket.requester_user_id, userId);

        const fechaResolucion = new Date().toLocaleDateString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        enviarEmailTicketResuelto(ticket.creador_email, {
            ticketCode: id_ticket,
            creador: ticket.creador_nombre,
            aparato: ticket.aparato,
            descripcion: ticket.description,
            fechaCreacion: ticket.fecha_creacion,
            fechaResolucion: fechaResolucion,
            tecnico: ticket.tecnico_nombre || usuario,
            resolucion: info_resolucion
        });

        const [comments] = await pool.query(`
            SELECT c.content as texto, DATE_FORMAT(c.comment_date, '%d/%m/%Y, %H:%i:%s') as fecha, u.first_name as usuario
            FROM comment c LEFT JOIN user u ON c.user_id = u.user_id WHERE c.ticket_id = ? ORDER BY c.comment_date DESC
        `, [ticket.ticket_id]);

        res.json({ success: true, comentarios: comments });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error resolviendo ticket' });
    }
});

app.post('/incidente/cerrar', async (req, res) => {
    req.body.info_resolucion = req.body.info_cierre || req.body.info_resolucion || '';
    const { id_ticket, usuario, info_resolucion } = req.body;

    try {
        const [tickets] = await pool.query(`
            SELECT
                t.ticket_id, t.status_id, t.description, t.requester_user_id,
                DATE_FORMAT(t.creation_date, '%d/%m/%Y, %H:%i:%s') as fecha_creacion,
                u_creador.first_name as creador_nombre,
                u_creador.institutional_email as creador_email,
                e.equipment_name as aparato,
                u_tecnico.first_name as tecnico_nombre
            FROM ticket t
            LEFT JOIN user u_creador ON t.requester_user_id = u_creador.user_id
            LEFT JOIN user u_tecnico ON t.assigned_user_id = u_tecnico.user_id
            LEFT JOIN equipment e ON t.equipment_id = e.equipment_id
            WHERE t.ticket_code = ?
        `, [id_ticket]);

        if (tickets.length === 0) return res.status(404).json({ error: 'Ticket no encontrado' });
        const ticket = tickets[0];

        const [users] = await pool.query('SELECT user_id FROM user WHERE first_name = ? LIMIT 1', [usuario]);
        const userId = users.length > 0 ? users[0].user_id : 1;
        const estadoPrevio = ticket.status_id;

        await pool.query('UPDATE ticket SET status_id = 4 WHERE ticket_id = ?', [ticket.ticket_id]);
        await pool.query('INSERT INTO comment (content, user_id, ticket_id) VALUES (?, ?, ?)',
            [`✅ TICKET RESUELTO.\nResolución: ${info_resolucion}`, userId, ticket.ticket_id]);

        const bitacora = textoEstado(estadoPrevio, 4, usuario);
        await pool.query('INSERT INTO comment (content, user_id, ticket_id) VALUES (?, ?, ?)',
            [bitacora, userId, ticket.ticket_id]);

        await marcarNotificacionCreador(ticket.ticket_id, ticket.requester_user_id, userId);

        const fechaResolucion = new Date().toLocaleDateString('es-CL', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        enviarEmailTicketResuelto(ticket.creador_email, {
            ticketCode: id_ticket,
            creador: ticket.creador_nombre,
            aparato: ticket.aparato,
            descripcion: ticket.description,
            fechaCreacion: ticket.fecha_creacion,
            fechaResolucion,
            tecnico: ticket.tecnico_nombre || usuario,
            resolucion: info_resolucion
        });

        const [comments] = await pool.query(`
            SELECT c.content as texto, DATE_FORMAT(c.comment_date, '%d/%m/%Y, %H:%i:%s') as fecha, u.first_name as usuario
            FROM comment c LEFT JOIN user u ON c.user_id = u.user_id WHERE c.ticket_id = ? ORDER BY c.comment_date DESC
        `, [ticket.ticket_id]);

        res.json({ success: true, comentarios: comments });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error resolviendo ticket' });
    }
});

// ==========================================
// RUTAS — MANUALES PDF
// ==========================================
app.get('/manuales', async (req, res) => {
    try {
        const archivos = fs.readdirSync(manualesDir);
        const manuales = archivos
            .filter(f => f.endsWith('.pdf'))
            .map(f => {
                const stat = fs.statSync(path.join(manualesDir, f));
                const nombreOriginal = f.replace(/^\d+-/, '');
                return {
                    filename: f,
                    nombre: nombreOriginal,
                    url: '/manuales/' + f,
                    tamañoMb: (stat.size / (1024 * 1024)).toFixed(2),
                    fecha: stat.birthtime.toLocaleDateString('es-CL')
                };
            })
            .sort((a, b) => b.fecha.localeCompare(a.fecha));

        res.json(manuales);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error listando manuales' });
    }
});

app.post('/manuales/subir', (req, res) => {
    uploadManual.single('manual')(req, res, function (err) {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'El archivo excede el límite de 50 MB.' });
            }
            return res.status(500).json({ error: err.message });
        } else if (err) {
            return res.status(400).json({ error: err.message });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No se recibió ningún archivo.' });
        }

        const nombreOriginal = req.file.originalname.replace(/[^a-zA-Z0-9._\-áéíóúÁÉÍÓÚñÑ ]/g, '_');
        const tamañoMb = (req.file.size / (1024 * 1024)).toFixed(2);

        res.json({
            success: true,
            message: `Manual "${nombreOriginal}" subido correctamente.`,
            url: '/manuales/' + req.file.filename,
            filename: req.file.filename,
            nombre: nombreOriginal,
            tamañoMb: tamañoMb
        });
    });
});

app.delete('/manuales/:filename', (req, res) => {
    const filename = req.params.filename;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ error: 'Nombre de archivo inválido.' });
    }

    const filePath = path.join(manualesDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Manual no encontrado.' });
    }

    try {
        fs.unlinkSync(filePath);
        res.json({ success: true, message: 'Manual eliminado correctamente.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error eliminando manual.' });
    }
});

app.use('/manuales', express.static(manualesDir));

// ==========================================
// INICIO DEL SERVIDOR
// ==========================================
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});