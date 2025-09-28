// Placeholder email sender; integrate real provider (SendGrid, SES, etc.) later.
export async function sendEmail(to: string, subject: string, text: string) {
  console.log(`[EMAIL] to=${to} subject=${subject} text=${text}`);
}
