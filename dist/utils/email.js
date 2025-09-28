// Placeholder email sender; integrate real provider (SendGrid, SES, etc.) later.
export async function sendEmail(to, subject, text) {
    console.log(`[EMAIL] to=${to} subject=${subject} text=${text}`);
}
