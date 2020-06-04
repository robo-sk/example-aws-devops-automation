const AWS = require('aws-sdk');
const log = require('../util/log');

const sesv2 = new AWS.SESV2();
const { TEMPLATE_ARN_PREFIX, EMAIL_FROM } = process.env;
if (!TEMPLATE_ARN_PREFIX) {
    log.error('TEMPLATE_ARN_PREFIX env var is empty.');
}
if (!EMAIL_FROM) {
    log.error('TEMPLATE_ARN_PREFIX env var is empty.');
}

/**
 * send email to all email addresses
 * @param {Object} param single input parameter with required keys
 * @param {string} param.templateId template ID of email to send
 * @param {string[]} param.emails list of email addreses
 * @param {object} param.params paremeters for email template
 */
const sendEmails = async ({ templateId, emails, params }) => {
    let resp;
    if (templateId && emails && emails.length > 0) {
        const input = {
            Content: {
                Template: {
                    TemplateArn: `${TEMPLATE_ARN_PREFIX}${templateId}`,
                    TemplateData: JSON.stringify(params),
                },
            },
            Destination: {
                ToAddresses: emails.filter((email) => email && email.length > 0),
            },
            EmailTags: [
                {
                    Name: 'TYPE',
                    Value: 'DEVOPS',
                },
            ],
            FromEmailAddress: EMAIL_FROM,
            ReplyToAddresses: [
                EMAIL_FROM,
            ],
        };

        log.debug('sending email: ', input);
        resp = sesv2.sendEmail(input).promise();
    }
    return resp;
};

exports.sendEmails = sendEmails;
