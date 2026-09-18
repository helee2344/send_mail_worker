"use strict"

import winston from 'winston';
import dotenv from "dotenv";
dotenv.config({path: `.env.delete_items`});

const getDatetime = () => {
  return (new Date()).toISOString();
}

class Logger {
  #loggerDebug = null
  #loggerInfo = null
  #loggerError = null

  constructor(LOG_PATH) {
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    );

    const fileFormat = winston.format.combine(
      winston.format.simple()
    );

    this.#loggerDebug = winston.createLogger({
      level: 'debug',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({format: consoleFormat}),
        new winston.transports.File({ filename: LOG_PATH, format: fileFormat }),
      ],
    });

    this.#loggerInfo = winston.createLogger({
      level: 'info',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({format: consoleFormat}),
        new winston.transports.File({ filename: LOG_PATH, format: fileFormat }),
      ],
    });

    this.#loggerError = winston.createLogger({
      level: 'error',
      format: winston.format.json(),
      transports: [
        new winston.transports.Console({format: consoleFormat}),
        new winston.transports.File({ filename: LOG_PATH, format: fileFormat }),
      ],
    });
  }

  log(str) {
    this.#loggerDebug.log('debug', `[${getDatetime()}]`, str)
  }
  info(str){
    this.#loggerInfo.log('info', `[${getDatetime()}]`, str)
  }
  error(str) {
    this.#loggerError.log('error', `[${getDatetime()}]`, str)
  }
}

export default Logger;