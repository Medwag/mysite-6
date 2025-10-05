// backend/otp.jsw
import wixData from 'wix-data';
import { sendWhatsAppTemplate } from 'backend/notify.jsw'; // your existing WhatsApp template sender
import crypto from 'crypto';

// OTP expiration in minutes
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const RESEND_COOLDOWN = 60; // seconds


// ✅ Generate a 6-digit OTP and send via WhatsApp
export async function sendOtp(userId, phone) {
    try {
        if (!userId || !phone) throw new Error("Missing userId or phone");

       const now = new Date();
// Check existing OTP
        const existing = await wixData.query("UserOtp")
            .eq("_owner", userId)
            .limit(1)
            .find({ suppressAuth: true });

			let otp, otpHash, expiresAt, attempts = 0, lastSent;

        if (existing.items.length > 0) {
            const record = existing.items[0];

            lastSent = record.lastSent || new Date(0);
            attempts = record.attempts || 0;

            const secondsSinceLastSend = (now - lastSent) / 1000;
            if (secondsSinceLastSend < RESEND_COOLDOWN) {
                return { success: false, error: `Please wait ${Math.ceil(RESEND_COOLDOWN - secondsSinceLastSend)} seconds before resending OTP.` };
            }
if (attempts >= MAX_ATTEMPTS) {
                return { success: false, error: "Maximum OTP attempts reached. Contact support." };
            }
        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Hash OTP before storing
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60000);
        expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60000);


record.otpHash = otpHash;
            record.expiresAt = expiresAt;
            record.attempts = attempts + 1;
            record.lastSent = now;
            await wixData.update("UserOtp", record, { suppressAuth: true });
			} else {
            otp = Math.floor(100000 + Math.random() * 900000).toString();
            otpHash = crypto.createHash('sha256').update(otp).digest('hex');
            expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60000);

await wixData.insert("UserOtp", {
                _owner: userId,
                otpHash,
                expiresAt,
                attempts: 1,
                lastSent: now
            }, { suppressAuth: true });

        // Upsert OTP record in CMS
        const existing = await wixData.query("UserOtp")
            .eq("_owner", userId)
            .limit(1)
            .find({ suppressAuth: true });

        if (existing.items.length > 0) {
            const item = existing.items[0];
            item.otpHash = otpHash;
            item.expiresAt = expiresAt;
            await wixData.update("UserOtp", item, { suppressAuth: true });
        } else {
            await wixData.insert("UserOtp", {
                _owner: userId,
                otpHash,
                expiresAt
            }, { suppressAuth: true });
        }

        // Send OTP via WhatsApp
        await sendWhatsAppTemplate(phone, "emergitag_otp", [otp]);
        return { success: true, message: "OTP sent" };

    } catch (err) {
        console.error("❌ sendOtp error:", err);
        return { success: false, error: err.message };
    }
}

// ✅ Verify OTP submitted by user
export async function verifyOtp(userId, otpInput) {
    try {
        if (!userId || !otpInput) throw new Error("Missing userId or OTP");

        const result = await wixData.query("UserOtp")
            .eq("_owner", userId)
            .limit(1)
            .find({ suppressAuth: true });

        if (!result.items.length) return { success: false, error: "OTP not found" };

        const record = result.items[0];
        const now = new Date();

        if (now > record.expiresAt) return { success: false, error: "OTP expired" };

        const otpHash = crypto.createHash('sha256').update(otpInput).digest('hex');
        if (otpHash !== record.otpHash) return { success: false, error: "OTP invalid" };

        // ✅ OTP valid, delete record
        await wixData.remove("UserOtp", record._id, { suppressAuth: true });

        return { success: true };
    } catch (err) {
        console.error("❌ verifyOtp error:", err);
        return { success: false, error: err.message };
    }
}
