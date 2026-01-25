// ============================================
// 🏗️ BTP CONNECT v9.0 - SERVICE EMAIL
// Envoi avec Nodemailer
// ============================================

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

// Configuration depuis les variables d'environnement
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.SMTP_FROM || 'noreply@btpconnect.fr'
};

// Transporter singleton
let transporter: Transporter | null = null;

/**
 * Initialise le transporter Nodemailer
 */
function getTransporter(): Transporter {
  if (transporter) return transporter;

  // Mode développement : utiliser Ethereal (fake SMTP)
  if (!EMAIL_CONFIG.user || process.env.NODE_ENV === 'development') {
    console.log('📧 Email: Mode développement (Ethereal)');
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      auth: {
        user: 'ethereal.user@ethereal.email',
        pass: 'ethereal.pass'
      }
    });
    return transporter;
  }

  // Mode production
  transporter = nodemailer.createTransport({
    host: EMAIL_CONFIG.host,
    port: EMAIL_CONFIG.port,
    secure: EMAIL_CONFIG.secure,
    auth: {
      user: EMAIL_CONFIG.user,
      pass: EMAIL_CONFIG.pass
    }
  });

  return transporter;
}

// Types
interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | string;
    contentType?: string;
  }>;
  cc?: string | string[];
  bcc?: string | string[];
  replyTo?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  error?: string;
}

/**
 * Envoie un email
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    const transport = getTransporter();
    
    const mailOptions = {
      from: EMAIL_CONFIG.from,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      attachments: options.attachments,
      cc: options.cc ? (Array.isArray(options.cc) ? options.cc.join(', ') : options.cc) : undefined,
      bcc: options.bcc ? (Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc) : undefined,
      replyTo: options.replyTo
    };

    const info = await transport.sendMail(mailOptions);
    
    // En mode dev, récupérer l'URL de preview Ethereal
    let previewUrl: string | undefined;
    if (info.messageId && process.env.NODE_ENV === 'development') {
      previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
      console.log('📧 Preview URL:', previewUrl);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl
    };

  } catch (error) {
    console.error('📧 Erreur envoi email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Envoie un compte rendu par email
 */
export async function sendCREmail(params: {
  destinataires: string[];
  crNumero: number;
  chantierNom: string;
  dateReunion: Date;
  pdfBuffer?: Buffer;
  entrepriseNom?: string;
}): Promise<EmailResult> {
  const { destinataires, crNumero, chantierNom, dateReunion, pdfBuffer, entrepriseNom } = params;

  const dateStr = new Date(dateReunion).toLocaleDateString('fr-FR');
  const subject = `Compte Rendu n°${crNumero} - ${chantierNom} - ${dateStr}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e293b; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Compte Rendu de Chantier</h1>
      </div>
      
      <div style="padding: 20px; background: #f8fafc;">
        <p>Bonjour,</p>
        
        <p>Veuillez trouver ci-joint le compte rendu n°<strong>${crNumero}</strong> de la réunion du <strong>${dateStr}</strong> concernant le chantier :</p>
        
        <div style="background: white; border-left: 4px solid #6366f1; padding: 15px; margin: 20px 0;">
          <h2 style="margin: 0 0 10px 0; color: #1e293b;">${chantierNom}</h2>
        </div>
        
        <p>Merci de prendre connaissance de ce document et de nous faire part de vos éventuelles observations.</p>
        
        <p>Cordialement,</p>
        <p><strong>${entrepriseNom || 'L\'équipe de conduite de travaux'}</strong></p>
      </div>
      
      <div style="background: #e2e8f0; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
        <p style="margin: 0;">Ce message a été envoyé automatiquement via BTP Connect.</p>
      </div>
    </div>
  `;

  const text = `
Compte Rendu de Chantier n°${crNumero}

Bonjour,

Veuillez trouver ci-joint le compte rendu n°${crNumero} de la réunion du ${dateStr} concernant le chantier : ${chantierNom}

Merci de prendre connaissance de ce document et de nous faire part de vos éventuelles observations.

Cordialement,
${entrepriseNom || "L'équipe de conduite de travaux"}

---
Ce message a été envoyé automatiquement via BTP Connect.
  `;

  const attachments = pdfBuffer ? [{
    filename: `CR-${crNumero}-${chantierNom.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
    content: pdfBuffer,
    contentType: 'application/pdf'
  }] : [];

  return sendEmail({
    to: destinataires,
    subject,
    html,
    text,
    attachments
  });
}

/**
 * Envoie une consultation (appel d'offres)
 */
export async function sendConsultationEmail(params: {
  destinataire: string;
  entrepriseNom: string;
  consultationRef: string;
  objet: string;
  dateLimite: Date;
  chantierNom: string;
  documents?: Array<{ filename: string; content: Buffer }>;
  entrepriseEmettrice?: string;
}): Promise<EmailResult> {
  const { destinataire, entrepriseNom, consultationRef, objet, dateLimite, chantierNom, documents, entrepriseEmettrice } = params;

  const dateStr = new Date(dateLimite).toLocaleDateString('fr-FR');
  const subject = `Consultation ${consultationRef} - ${objet}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e293b; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">Appel d'Offres</h1>
      </div>
      
      <div style="padding: 20px; background: #f8fafc;">
        <p>Bonjour <strong>${entrepriseNom}</strong>,</p>
        
        <p>Nous avons le plaisir de vous consulter pour le marché suivant :</p>
        
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #64748b; width: 120px;">Référence</td>
              <td style="padding: 8px 0; font-weight: bold;">${consultationRef}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Objet</td>
              <td style="padding: 8px 0; font-weight: bold;">${objet}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Chantier</td>
              <td style="padding: 8px 0;">${chantierNom}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748b;">Date limite</td>
              <td style="padding: 8px 0; color: #dc2626; font-weight: bold;">${dateStr}</td>
            </tr>
          </table>
        </div>
        
        ${documents?.length ? `
        <p>Documents joints :</p>
        <ul style="background: white; padding: 15px 15px 15px 35px; border-radius: 8px; margin: 15px 0;">
          ${documents.map(d => `<li>${d.filename}</li>`).join('')}
        </ul>
        ` : ''}
        
        <p>Merci de nous faire parvenir votre offre avant la date limite indiquée.</p>
        
        <p>Cordialement,</p>
        <p><strong>${entrepriseEmettrice || 'Le service consultation'}</strong></p>
      </div>
      
      <div style="background: #e2e8f0; padding: 15px; text-align: center; font-size: 12px; color: #64748b;">
        <p style="margin: 0;">Ce message a été envoyé automatiquement via BTP Connect.</p>
      </div>
    </div>
  `;

  const text = `
Appel d'Offres - Consultation ${consultationRef}

Bonjour ${entrepriseNom},

Nous avons le plaisir de vous consulter pour le marché suivant :

Référence : ${consultationRef}
Objet : ${objet}
Chantier : ${chantierNom}
Date limite : ${dateStr}

Merci de nous faire parvenir votre offre avant la date limite indiquée.

Cordialement,
${entrepriseEmettrice || 'Le service consultation'}

---
Ce message a été envoyé automatiquement via BTP Connect.
  `;

  return sendEmail({
    to: destinataire,
    subject,
    html,
    text,
    attachments: documents
  });
}

/**
 * Envoie une relance pour consultation
 */
export async function sendRelanceEmail(params: {
  destinataire: string;
  entrepriseNom: string;
  consultationRef: string;
  objet: string;
  dateLimite: Date;
  nbRelances: number;
}): Promise<EmailResult> {
  const { destinataire, entrepriseNom, consultationRef, objet, dateLimite, nbRelances } = params;

  const dateStr = new Date(dateLimite).toLocaleDateString('fr-FR');
  const joursRestants = Math.ceil((new Date(dateLimite).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const subject = `RELANCE ${nbRelances > 1 ? `(${nbRelances})` : ''} - Consultation ${consultationRef}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #f59e0b; color: white; padding: 20px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px;">⚠️ RELANCE</h1>
      </div>
      
      <div style="padding: 20px; background: #f8fafc;">
        <p>Bonjour <strong>${entrepriseNom}</strong>,</p>
        
        <p>Nous n'avons pas encore reçu votre offre pour la consultation suivante :</p>
        
        <div style="background: white; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0;"><strong>${consultationRef}</strong> - ${objet}</p>
          <p style="margin: 0; color: #dc2626; font-size: 18px; font-weight: bold;">
            Date limite : ${dateStr} (${joursRestants > 0 ? `J-${joursRestants}` : 'DÉPASSÉE'})
          </p>
        </div>
        
        <p>Merci de nous transmettre votre réponse dans les meilleurs délais.</p>
        
        <p>Cordialement</p>
      </div>
    </div>
  `;

  return sendEmail({
    to: destinataire,
    subject,
    html
  });
}

/**
 * Test la configuration email
 */
export async function testEmailConfig(): Promise<{ success: boolean; error?: string }> {
  try {
    const transport = getTransporter();
    await transport.verify();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
