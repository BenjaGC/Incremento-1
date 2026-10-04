-- MySQL Workbench Forward Engineering

SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0;
SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0;
SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- -----------------------------------------------------
-- Schema mydb
-- -----------------------------------------------------

-- -----------------------------------------------------
-- Schema mydb
-- -----------------------------------------------------
CREATE SCHEMA IF NOT EXISTS `mydb` DEFAULT CHARACTER SET utf8mb4 ;
USE `mydb` ;

-- -----------------------------------------------------
-- Table `mydb`.`user`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`user` (
  `user_id` INT NOT NULL AUTO_INCREMENT,
  `first_name` VARCHAR(50) NOT NULL,
  `first_last_name` VARCHAR(50) NOT NULL,
  `second_last_name` VARCHAR(50) NOT NULL,
  `institutional_email` VARCHAR(150) NOT NULL,
  `rut` VARCHAR(15) NOT NULL,
  `username` VARCHAR(45) NOT NULL,
  `password_hash` VARCHAR(250) NOT NULL,
  `user_status` TINYINT NULL DEFAULT 1,
  `created_at` DATETIME NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login` DATETIME NULL,
  `phone_number` VARCHAR(12) NULL,
  PRIMARY KEY (`user_id`),
  UNIQUE INDEX `institutional_email_UNIQUE` (`institutional_email` ASC),
  UNIQUE INDEX `rut_UNIQUE` (`rut` ASC),
  UNIQUE INDEX `username_UNIQUE` (`username` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`session`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`session` (
  `session_id` INT NOT NULL AUTO_INCREMENT,
  `session_token` VARCHAR(200) NOT NULL,
  `ip_address` VARCHAR(45) NOT NULL,
  `login_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` DATETIME NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `user_id` INT NOT NULL,
  PRIMARY KEY (`session_id`),
  UNIQUE INDEX `session_token_UNIQUE` (`session_token` ASC),
  INDEX `fk_session_user_idx` (`user_id` ASC),
  CONSTRAINT `fk_session_user`
    FOREIGN KEY (`user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`notification`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`notification` (
  `notification_id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(150) NOT NULL,
  `message` TEXT NOT NULL,
  `notification_type` VARCHAR(45) NOT NULL,
  `delivery_channel` VARCHAR(45) NOT NULL,
  `is_read` TINYINT NOT NULL DEFAULT 0,
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` INT NOT NULL,
  PRIMARY KEY (`notification_id`),
  INDEX `fk_notification_user1_idx` (`user_id` ASC),
  CONSTRAINT `fk_notification_user1`
    FOREIGN KEY (`user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`category`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`category` (
  `category_id` INT NOT NULL AUTO_INCREMENT,
  `category_name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `default_sla_hours` INT NOT NULL DEFAULT 24,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `creation_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`category_id`),
  UNIQUE INDEX `category_name_UNIQUE` (`category_name` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`status`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`status` (
  `status_id` INT NOT NULL AUTO_INCREMENT,
  `status_name` VARCHAR(45) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  `is_closed` TINYINT NOT NULL DEFAULT 0,
  PRIMARY KEY (`status_id`),
  UNIQUE INDEX `status_name_UNIQUE` (`status_name` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`priority`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`priority` (
  `priority_id` INT NOT NULL AUTO_INCREMENT,
  `priority_name` VARCHAR(45) NOT NULL,
  `sla_hours` INT NOT NULL DEFAULT 24,
  `color_hex` VARCHAR(7) NULL DEFAULT NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`priority_id`),
  UNIQUE INDEX `priority_name_UNIQUE` (`priority_name` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`equipment`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`equipment` (
  `equipment_id` INT NOT NULL AUTO_INCREMENT,
  `equipment_name` VARCHAR(100) NOT NULL,
  `equipment_type` VARCHAR(50) NOT NULL,
  `model` VARCHAR(100) NULL DEFAULT NULL,
  `serial_number` VARCHAR(100) NULL DEFAULT NULL,
  `purchase_date` DATE NULL DEFAULT NULL,
  `warranty_expiration` DATE NULL DEFAULT NULL,
  `location` VARCHAR(100) NULL DEFAULT NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`equipment_id`),
  UNIQUE INDEX `serial_number_UNIQUE` (`serial_number` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`ticket`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`ticket` (
  `ticket_id` INT NOT NULL AUTO_INCREMENT,
  `ticket_code` VARCHAR(20) NOT NULL,
  `title` VARCHAR(150) NOT NULL,
  `description` TEXT NOT NULL,
  `creation_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `update_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  `close_date` DATETIME NULL DEFAULT NULL,
  `assignment_date` DATETIME NULL DEFAULT NULL,
  `sla_due_date` DATETIME NULL DEFAULT NULL,
  `reopen_count` INT NOT NULL DEFAULT 0,
  `time_spent_minutes` INT NOT NULL DEFAULT 0,
  `is_archived` TINYINT NOT NULL DEFAULT 0,
  `ticket_origin` ENUM('web', 'email', 'phone', 'internal') NOT NULL DEFAULT 'web',
  `requester_user_id` INT NOT NULL,
  `technician_user_id` INT NULL,
  `category_id` INT NOT NULL,
  `status_id` INT NOT NULL,
  `priority_id` INT NOT NULL,
  `equipment_id` INT NOT NULL,
  PRIMARY KEY (`ticket_id`),
  UNIQUE INDEX `ticket_code_UNIQUE` (`ticket_code` ASC),
  INDEX `fk_ticket_category1_idx` (`category_id` ASC),
  INDEX `fk_ticket_status1_idx` (`status_id` ASC) ,
  INDEX `fk_ticket_priority1_idx` (`priority_id` ASC),
  INDEX `fk_ticket_equipment1_idx` (`equipment_id` ASC),
  INDEX `fk_ticket_requester_idx` (`requester_user_id` ASC),
  INDEX `fk_ticket_technician_idx` (`technician_user_id` ASC),
  CONSTRAINT `fk_ticket_category1`
    FOREIGN KEY (`category_id`)
    REFERENCES `mydb`.`category` (`category_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_ticket_status1`
    FOREIGN KEY (`status_id`)
    REFERENCES `mydb`.`status` (`status_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_ticket_priority1`
    FOREIGN KEY (`priority_id`)
    REFERENCES `mydb`.`priority` (`priority_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_ticket_equipment1`
    FOREIGN KEY (`equipment_id`)
    REFERENCES `mydb`.`equipment` (`equipment_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_ticket_requester`
    FOREIGN KEY (`requester_user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_ticket_technician`
    FOREIGN KEY (`technician_user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`comment`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`comment` (
  `comment_id` INT NOT NULL AUTO_INCREMENT,
  `content` TEXT NOT NULL,
  `comment_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_internal` TINYINT NOT NULL DEFAULT 0,
  `user_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  PRIMARY KEY (`comment_id`),
  INDEX `fk_comment_user1_idx` (`user_id` ASC),
  INDEX `fk_comment_ticket1_idx` (`ticket_id` ASC),
  CONSTRAINT `fk_comment_user1`
    FOREIGN KEY (`user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_comment_ticket1`
    FOREIGN KEY (`ticket_id`)
    REFERENCES `mydb`.`ticket` (`ticket_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`status_history`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`status_history` (
  `history_id` INT NOT NULL AUTO_INCREMENT,
  `previous_status_id` INT NULL DEFAULT NULL,
  `new_status_id` INT NOT NULL,
  `change_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `change_reason` VARCHAR(200) NULL DEFAULT NULL,
  `ticket_id` INT NOT NULL,
  `changed_by_user_id` INT NOT NULL,
  PRIMARY KEY (`history_id`),
  INDEX `fk_status_history_ticket1_idx` (`ticket_id` ASC),
  INDEX `changed_by_user_id_idx` (`changed_by_user_id` ASC),
  CONSTRAINT `fk_status_history_ticket1`
    FOREIGN KEY (`ticket_id`)
    REFERENCES `mydb`.`ticket` (`ticket_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_status_history_user`
    FOREIGN KEY (`changed_by_user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`audit_log`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`audit_log` (
  `log_id` INT NOT NULL AUTO_INCREMENT,
  `action_type` VARCHAR(100) NOT NULL,
  `affected_table` VARCHAR(100) NOT NULL,
  `affected_record_id` INT NULL DEFAULT NULL,
  `previous_value` TEXT NULL DEFAULT NULL,
  `new_value` TEXT NULL DEFAULT NULL,
  `ip_address` VARCHAR(45) NULL DEFAULT NULL,
  `browser_info` VARCHAR(255) NULL DEFAULT NULL,
  `action_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  PRIMARY KEY (`log_id`),
  INDEX `fk_audit_log_user1_idx` (`user_id` ASC),
  INDEX `fk_audit_log_ticket1_idx` (`ticket_id` ASC),
  CONSTRAINT `fk_audit_log_user1`
    FOREIGN KEY (`user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_audit_log_ticket1`
    FOREIGN KEY (`ticket_id`)
    REFERENCES `mydb`.`ticket` (`ticket_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`attachment`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`attachment` (
  `attachment_id` INT NOT NULL AUTO_INCREMENT,
  `file_name` VARCHAR(255) NOT NULL,
  `file_path` VARCHAR(500) NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `file_size_mb` DECIMAL(10,2) NULL DEFAULT NULL,
  `upload_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_deleted` TINYINT NOT NULL DEFAULT 0,
  `upload_by_user_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  PRIMARY KEY (`attachment_id`),
  INDEX `fk_attachment_ticket1_idx` (`ticket_id` ASC),
  INDEX `upload_by_user_id_idx` (`upload_by_user_id` ASC),
  CONSTRAINT `fk_attachment_ticket1`
    FOREIGN KEY (`ticket_id`)
    REFERENCES `mydb`.`ticket` (`ticket_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_attachment_user`
    FOREIGN KEY (`upload_by_user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`material`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`material` (
  `material_id` INT NOT NULL AUTO_INCREMENT,
  `material_name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL DEFAULT NULL,
  `stock` INT NOT NULL DEFAULT 0,
  `minimum_stock` INT NOT NULL DEFAULT 0,
  `unit_measure` VARCHAR(20) NOT NULL DEFAULT 'unidad',
  `unit_cost` DECIMAL(10,2) NULL DEFAULT NULL,
  `is_active` TINYINT NOT NULL DEFAULT 1,
  PRIMARY KEY (`material_id`))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`material_used`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`material_used` (
  `material_used_id` INT NOT NULL AUTO_INCREMENT,
  `quantity` INT NOT NULL DEFAULT 1,
  `usage_date` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `comment` VARCHAR(255) NULL DEFAULT NULL,
  `observation` TEXT NULL DEFAULT NULL,
  `registered_by_user_id` INT NOT NULL,
  `ticket_id` INT NOT NULL,
  `material_id` INT NOT NULL,
  PRIMARY KEY (`material_used_id`),
  INDEX `fk_material_used_ticket1_idx` (`ticket_id` ASC),
  INDEX `fk_material_used_material1_idx` (`material_id` ASC),
  INDEX `registered_by_user_id_idx` (`registered_by_user_id` ASC),
  CONSTRAINT `fk_material_used_ticket1`
    FOREIGN KEY (`ticket_id`)
    REFERENCES `mydb`.`ticket` (`ticket_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_material_used_material1`
    FOREIGN KEY (`material_id`)
    REFERENCES `mydb`.`material` (`material_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_registered_by_user_id`
    FOREIGN KEY (`registered_by_user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`ticket_evaluation`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`ticket_evaluation` (
  `id_ticket_evaluation` INT NOT NULL AUTO_INCREMENT,
  `user_rating` TINYINT NOT NULL,
  `closing_comment` TEXT NULL,
  `ticket_id` INT NOT NULL,
  PRIMARY KEY (`id_ticket_evaluation`),
  INDEX `fk_ticket_evaluation_ticket1_idx` (`ticket_id` ASC),
  UNIQUE INDEX `ticket_id_UNIQUE` (`ticket_id` ASC),
  CONSTRAINT `fk_ticket_evaluation_ticket1`
    FOREIGN KEY (`ticket_id`)
    REFERENCES `mydb`.`ticket` (`ticket_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`qr_ticket`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`qr_ticket` (
  `qr_ticket_id` INT NOT NULL AUTO_INCREMENT,
  `qr_token` VARCHAR(255) NOT NULL,
  `qr_expiration` DATETIME NOT NULL,
  `ticket_id` INT NOT NULL,
  PRIMARY KEY (`qr_ticket_id`),
  UNIQUE INDEX `qr_token_UNIQUE` (`qr_token` ASC),
  INDEX `fk_qr_ticket_ticket1_idx` (`ticket_id` ASC),
  UNIQUE INDEX `ticket_id_UNIQUE` (`ticket_id` ASC),
  CONSTRAINT `fk_qr_ticket_ticket1`
    FOREIGN KEY (`ticket_id`)
    REFERENCES `mydb`.`ticket` (`ticket_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`role`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`role` (
  `role_id` INT NOT NULL AUTO_INCREMENT,
  `role_name` VARCHAR(50) NOT NULL,
  `description` VARCHAR(255) NULL,
  PRIMARY KEY (`role_id`),
  UNIQUE INDEX `role_name_UNIQUE` (`role_name` ASC))
ENGINE = InnoDB;


-- -----------------------------------------------------
-- Table `mydb`.`user_role`
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS `mydb`.`user_role` (
  `user_role_id` INT NOT NULL AUTO_INCREMENT,
  `assignment_date` DATETIME NOT NULL,
  `active` TINYINT NOT NULL,
  `role_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  PRIMARY KEY (`user_role_id`),
  INDEX `fk_user_role_role1_idx` (`role_id` ASC),
  INDEX `fk_user_role_user1_idx` (`user_id` ASC),
  UNIQUE INDEX `uk_user_role` (`role_id` ASC, `user_id` ASC),
  CONSTRAINT `fk_user_role_role1`
    FOREIGN KEY (`role_id`)
    REFERENCES `mydb`.`role` (`role_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION,
  CONSTRAINT `fk_user_role_user1`
    FOREIGN KEY (`user_id`)
    REFERENCES `mydb`.`user` (`user_id`)
    ON DELETE NO ACTION
    ON UPDATE NO ACTION)
ENGINE = InnoDB;


SET SQL_MODE=@OLD_SQL_MODE;
SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS;
SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS;
