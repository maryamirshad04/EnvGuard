const Mailjet = require('node-mailjet');
const logger = require('../utils/logger');

function maskEmail(email) {
  if (!email) return 'unknown';
  const atIndex = email.indexOf('@');
  if (atIndex === -1) return email; 
  const local = email.substring(0, atIndex);
  const domain = email.substring(atIndex);
  if (local.length <= 3) {
    return '***' + domain;
  }
  return local.substring(0, 3) + '***' + domain;
}

if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_API_SECRET) {
  logger.error('Missing MAILJET_API_KEY or MAILJET_API_SECRET in .env');
  throw new Error('Missing MAILJET_API_KEY or MAILJET_API_SECRET in .env');
}
if (!process.env.MAILJET_SENDER_EMAIL) {
  logger.error('Missing MAILJET_SENDER_EMAIL in .env (must be a verified Mailjet sender)');
  throw new Error('Missing MAILJET_SENDER_EMAIL in .env (must be a verified Mailjet sender)');
}

const mailjet = Mailjet.apiConnect(process.env.MAILJET_API_KEY, process.env.MAILJET_API_SECRET);

async function sendInviteEmail({ toEmail, companyName, role, inviteLink, invitedByEmail }) {
  logger.info(
    {
      toEmail: maskEmail(toEmail),
      companyName,
      role,
      invitedBy: maskEmail(invitedByEmail),
    },
    `Sending invite email to ${maskEmail(toEmail)} for ${companyName}`
  );

  try {
    const response = await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: { Email: process.env.MAILJET_SENDER_EMAIL, Name: 'EnvGuard' },
          To: [{ Email: toEmail }],
          Subject: `${invitedByEmail} invited you to join ${companyName} on EnvGuard`,
          TextPart:
            `You've been invited to join ${companyName} on EnvGuard as ${role}.\n\n` +
            `Accept your invite: ${inviteLink}\n\nThis link expires in 7 days.`,
          HTMLPart: `
            <p>${invitedByEmail} invited you to join <strong>${companyName}</strong> on EnvGuard as <strong>${role}</strong>.</p>
            <p><a href="${inviteLink}">Accept your invite</a></p>
            <p style="color:#888;font-size:12px;">This link expires in 7 days.</p>
          `,
        },
      ],
    });

    logger.info(
      {
        toEmail: maskEmail(toEmail),
        companyName,
        messageId: response?.body?.Messages?.[0]?.MessageID,
      },
      `Invite email sent successfully to ${maskEmail(toEmail)}`
    );
    return response;
  } catch (error) {
    logger.error(
      {
        toEmail: maskEmail(toEmail),
        companyName,
        error: error.message,
        stack: error.stack,
      },
      `Failed to send invite email to ${maskEmail(toEmail)}`
    );
    throw error;
  }
}

module.exports = { sendInviteEmail };