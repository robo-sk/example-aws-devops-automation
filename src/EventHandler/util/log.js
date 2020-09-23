const DEBUG = (process.env.DEBUG || 'true').toLowerCase() === 'true';
const INFO = DEBUG || (process.env.INFO || '').toLowerCase() === 'true';

const logMethod = {
    log: console.log,
    debug: console.log,
    warn: console.warn,
    info: console.log,
    error: console.error,
};
const log = (...args) => {
    const logType = args && args.length > 0 ? args[0] : 'log';
    const logMessage = args && args.length > 1 ? args[1] : '';
    if (typeof logMessage !== 'string') {
        throw new Error('First logging argument needs to be string');
    }
    const secondArg = args && args.length > 2 ? args[2] : undefined;
    let logObj;
    let rest;
    if (secondArg && typeof secondArg === 'object' && !Array.isArray(secondArg)) {
        logObj = {
            ...secondArg,
            logMessage,
            logType,
        };
        rest = (args && args.length > 3 ? args.slice(3) : []).map((arg) => (typeof arg === 'object' && !(arg instanceof Error) ? JSON.stringify(arg) : arg));
    } else {
        logObj = {
            logMessage,
            logType,
        };
        rest = (args && args.length > 2 ? args.slice(2) : []).map((arg) => (typeof arg === 'object' && !(arg instanceof Error) ? JSON.stringify(arg) : arg));
    }

    if (args && args.length > 3) {
        console.error('You are using more then 2 arguments for loggin. We are not able to use it for search.');
    }
    // construct final args for logging
    let out;
    if (rest.length > 0) {
        out = [`[${logType.padEnd(5)}] `, logMessage, JSON.stringify(logObj), ...rest];
    } else {
        out = [`[${logType.padEnd(5)}] `, logMessage, JSON.stringify(logObj)];
    }

    (logMethod[logType] || logMethod.log)(...out);
};
const err = (...args) => log('error', ...args);
const warn = (...args) => INFO && log('warn', ...args);
const info = (...args) => INFO && log('info', ...args);
const debug = (...args) => DEBUG && log('debug', ...args);

exports.error = err;
exports.warn = warn;
exports.info = info;
exports.debug = debug;
