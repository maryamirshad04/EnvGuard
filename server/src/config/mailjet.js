const Mailjet = require('node-mailjet');

if (!process.env.MAILJET_API_KEY || !process.env.MAILJET_API_SECRET) {
  throw new Error('Missing MAILJET_API_KEY or MAILJET_API_SECRET in .env');
}
if (!process.env.MAILJET_SENDER_EMAIL) {
  throw new Error('Missing MAILJET_SENDER_EMAIL in .env (must be a verified Mailjet sender)');
}

const mailjet = Mailjet.apiConnect(process.env.MAILJET_API_KEY, process.env.MAILJET_API_SECRET);

async function sendInviteEmail({ toEmail, companyName, role, inviteLink, invitedByEmail }) {
  await mailjet.post('send', { version: 'v3.1' }).request({
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
}

module.exports = { sendInviteEmail };