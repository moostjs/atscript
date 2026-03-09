import asLogo from '../../public/logo.svg?raw'
import code from './icons/code.svg?raw'
import mongodb from './icons/mongodb.svg?raw'
import mysql from './icons/mysql.svg?raw'
import postgres from './icons/postgres.svg?raw'
import restApi from './icons/rest-api.svg?raw'
import sqlite from './icons/sqlite.svg?raw'
import typescript from './icons/typescript.svg?raw'
import vscode from './icons/vscode.svg?raw'

export const asLogoSvg = asLogo

export const roadmapIcons = {
    typescript: {
        svg: typescript,
        color: '#3178C6',
        background: 'rgba(49, 120, 198, 0.1)',
    },
    validation: {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.85" d="M12 2.75L19 5.9v5.02c0 4.53-2.86 8.42-7 10.33c-4.14-1.91-7-5.8-7-10.33V5.9z"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.85" d="m8.35 12.2l2.3 2.3l5-5"/></svg>',
        color: '#127791',
        background: 'rgba(18, 119, 145, 0.11)',
    },
    sqlite: {
        svg: sqlite,
        color: '#0F80CC',
        background: 'rgba(15, 128, 204, 0.1)',
    },
    mongodb: {
        svg: mongodb,
        color: '#47A248',
        background: 'rgba(71, 162, 72, 0.1)',
    },
    api: {
        svg: restApi,
        color: '#6B46C1',
        background: 'rgba(107, 70, 193, 0.11)',
    },
    visualstudiocode: {
        svg: vscode,
        color: '#007ACC',
        background: 'rgba(0, 122, 204, 0.1)',
    },
    uiForm: {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="3" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.75" d="M7.5 8h9m-9 4h4.2m-4.2 4h9"/><circle cx="15.7" cy="12" r="1.4" fill="currentColor"/></svg>',
        color: '#D97706',
        background: 'rgba(217, 119, 6, 0.11)',
    },
    tableView: {
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="15.5" rx="3" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.75" d="M3.5 8.7h17M9 8.7v10.8m6 0V8.7"/></svg>',
        color: '#D97706',
        background: 'rgba(217, 119, 6, 0.11)',
    },
    postgresql: {
        svg: postgres,
        color: '#336791',
        background: 'rgba(51, 103, 145, 0.1)',
    },
    mysql: {
        svg: mysql,
        color: '#4479A1',
        background: 'rgba(68, 121, 161, 0.1)',
    },
    language: {
        svg: code,
        color: '#7C3AED',
        background: 'rgba(124, 58, 237, 0.11)',
    },
}
