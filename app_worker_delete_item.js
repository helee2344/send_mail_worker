"use strict"

import fs from "fs";
import dotenv from "dotenv";
dotenv.config({path: `./.env.delete_items`});

import mysql from 'mysql2/promise';
import AWS from 'aws-sdk';
AWS.config.update({ region: 'ap-northeast-2' });

import Logger from './logger.js';

const LOG_PATH = process.env.LOG_PATH || "./log/delete_items.log";
const logger = new Logger(LOG_PATH);

const LIMIT_COUNT = Number(process.env.LIMIT_COUNT) || 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


const escape = (value) => {
  return mysql.escape(value)
}

const getConnection = async () => {
  let password = '1234';

  let conn;
  try {
    conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      // ssl: { rejectUnauthorized: false, ca: fs.readFileSync('./global-bundle.pem') }
    });
    return conn;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  }
}


const getUserIdx = async (connection, userIdx) => {
  // 1. Open the connection
  try {
    const query = `SELECT idx FROM ${DATABASE}.User WHERE idx = ${escape(userIdx)}`;
    logger.log(`# query : ${query}`);
    const [rows] = await connection.execute(query);
    logger.log(JSON.stringify(rows));
    if (rows.length > 0) {
      return rows[0].idx;
    }
  } catch (error) {
    logger.error(error);
  }

  return undefined;
}

const execute = async () => {
  // 1. Open the connection
  const connection = await getConnection()

  try {
    let not_found_user_count = 0;
    let loop = true;
    let targetUserIdx= Number(process.env.START_ITEM_IDX);

    do {
      const userIdx = await getUserIdx(connection, targetUserIdx);
      logger.log(`user_idx: ${userIdx}`)
      if (undefined == userIdx) {
        not_found_user_count++;
        continue;
      }

      const query = `SELECT * FROM ${process.env.DB_DATABASE}.Item WHERE user_idx = ${escape(userIdx)} AND cnt = 0 AND item_no > 1000 ORDER BY item_idx ASC LIMIT 10`;
      // logger.log(`# query : ${query}`);
      const [rows, data] = await connection.query(query);
      if (rows && 0 < rows.length) {
        const target_item_idx = [];
        for (const row of rows) {
          logger.log(`row : ${JSON.stringify(row)}`);
          target_item_idx.push(row.item_idx);
        }

        const delete_query_item = `DELETE FROM ${process.env.DB_DATABASE}.Item WHERE user_idx = ${escape(userIdx)} AND item_idx IN (${target_item_idx.join(',')})`;
        logger.log(`# delete_query Item : ${delete_query_item}`);
        await connection.query(delete_query_item);
        await sleep(100);
        const delete_query_module_item = `DELETE FROM ${process.env.DB_DATABASE}.ModuleItem WHERE user_idx = ${escape(userIdx)} AND item_idx IN (${target_item_idx.join(',')}) AND isSell=true`;
        logger.log(`# delete_query ModuleItem : ${delete_query_module_item}`);
        await connection.query(delete_query_item);
        await sleep(100);
      } else {
        targetUserIdx++;
      }
      if ( 10 < not_found_user_count ) {
        loop = false;
      }
    } while(loop);


  } catch (error) {
    console.error(error);
  } finally {
    // 2. CRITICAL: Always close single connections manually
    connection.end();
  }
}



async function main() {
  logger.log(`Start delete items`)
  await execute()
}

main();
