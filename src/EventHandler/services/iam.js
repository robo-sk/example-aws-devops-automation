const AWS = require('aws-sdk');
const log = require('../util/log');

const iam = new AWS.IAM();

const getUser = async ({ UserName }) => {
    const params = {
        UserName,
    };
    const resp = await iam.getUser(params).promise();
    return (resp || {}).User;
};

const getUserEmail = async ({ UserName }) => {
    const user = await getUser({ UserName });
    log.debug('Found user. ', user, ` UserName:${UserName}`);
    let email;
    if (user && user.Tags) {
        (user.Tags || []).forEach((tag) => {
            if (tag.Key === 'email') {
                email = tag.Value;
            }
        });
    }
    log.debug(`Found user email: ${email}`);
    return email;
};

/**
 * get emails for IAM users
 * @param {string[]} userNames
 */
const getUserEmails = async (userNames) => {
    let userEmails;
    if (userNames && userNames.length > 0) {
        const results = await Promise.allSettled(userNames.map((UserName) => getUserEmail({ UserName })));
        userEmails = results.map((result) => {
            if (result.status === 'rejected') {
                log.error('Unable to get email address for iam user.', result.reason);
                return undefined;
            }
            return result.value;
        });
        log.debug(`Found user emails: ${userEmails}`);
    } else {
        log.debug('No userNames to convert to emails');
    }

    return userEmails || [];
};

exports.getUserEmails = getUserEmails;
