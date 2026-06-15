import { Resend } from 'resend'

const from = () => process.env.RESEND_FROM ?? 'Ranchadapp <onboarding@resend.dev>'
const client = () => new Resend(process.env.RESEND_API_KEY)

export async function sendPasswordReset(to: string, resetLink: string) {
  return client().emails.send({
    from: from(),
    to,
    subject: 'Recuperar contraseña — Ranchadapp',
    html: passwordResetHtml(resetLink),
  })
}

export async function sendEmailConfirmation(to: string, confirmLink: string) {
  return client().emails.send({
    from: from(),
    to,
    subject: 'Confirmá tu cuenta — Ranchadapp',
    html: confirmationHtml(confirmLink),
  })
}

function layout(content: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0"
        style="background:#fff;border-radius:16px;overflow:hidden;max-width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#000;padding:22px 32px;">
            <span style="font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.3px;">🎮 Ranchadapp</span>
          </td>
        </tr>
        ${content}
        <tr>
          <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eee;text-align:center;">
            <p style="margin:0;color:#aaa;font-size:11px;">An app by CarpinchoGames ® — si no pediste esto, ignorá este mail.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function passwordResetHtml(link: string) {
  return layout(`
    <tr>
      <td style="padding:36px 32px;">
        <h2 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#111;">Recuperar contraseña</h2>
        <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.7;">
          Recibimos una solicitud para resetear la contraseña de tu cuenta.<br/>
          Hacé click en el botón para crear una nueva contraseña.
        </p>
        <a href="${link}"
          style="display:inline-block;padding:14px 32px;background:#D4001A;color:#fff;font-weight:700;
                 font-size:15px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">
          Resetear contraseña →
        </a>
        <p style="margin:28px 0 0;color:#999;font-size:12px;line-height:1.6;">
          Este link expira en 24 horas. Si no pediste este cambio, podés ignorar este mail.
        </p>
      </td>
    </tr>
  `)
}

function confirmationHtml(link: string) {
  return layout(`
    <tr>
      <td style="padding:36px 32px;">
        <h2 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#111;">¡Bienvenido/a a Ranchadapp!</h2>
        <p style="margin:0 0 24px;color:#555;font-size:14px;line-height:1.7;">
          Tu cuenta está casi lista. Confirmá tu mail haciendo click en el botón de abajo.
        </p>
        <a href="${link}"
          style="display:inline-block;padding:14px 32px;background:#D4001A;color:#fff;font-weight:700;
                 font-size:15px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">
          Confirmar mi cuenta →
        </a>
        <p style="margin:28px 0 0;color:#999;font-size:12px;line-height:1.6;">
          Si no creaste una cuenta en Ranchadapp, ignorá este mail.
        </p>
      </td>
    </tr>
  `)
}
