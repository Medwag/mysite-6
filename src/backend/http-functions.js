import wixData from 'wix-data';
import wixSecretsBackend from 'wix-secrets-backend';
import { ok, serverError, badRequest, response } from 'wix-http-functions';
import { fetch } from 'wix-fetch';
import { sendDiscordLog } from 'backend/logger.jsw';
import { getPayFastConfig } from 'backend/payfast-config.jsw';
// Lint guard: optional handler referenced behind typeof
const handleFirstPaymentSuccess = undefined;
import { sendEmailAlert } from 'backend/email.jsw';
import { sendWhatsAppTemplate } from 'backend/whatsapp.jsw';
import {
  handleSubscriptionPayment,
  handleSuccessfulTransaction,
  handleFailedTransaction,
  handleDispute,
  handleSubscriptionDisable,
  handleSignUpPaymentSuccess
} from 'backend/paystackUrl.jsw';

/* === Lazy crypto import === */
let crypto = null;
async function getCrypto() {
  if (!crypto) {
    try {
      crypto = await import('crypto');
    } catch (err) {
      console.warn('⚠️ Crypto module not available:', err.message);
      return null;
    }
  }
  return crypto;
}

/* === PayFast trusted IPs === */
const PAYFAST_IPS = [
  '197.97.145.144', '197.97.145.145',
  '197.97.145.146', '197.97.145.147',
  '197.97.145.148', '197.97.145.149'
];

/* === Helper: Mark Profile Paid === */
async function markSignUpPaid(userId, paymentId) {
  try {
    const profileQuery = await wixData.query('Emergency_Profiles')
      .eq('_owner', userId)
      .limit(1)
      .find({ suppressAuth: true });

    const profile = profileQuery.items[0];
    if (!profile) return null;

    profile.signUpPaid = true;
    profile.lastPaymentDate = new Date();
    profile.payFastPaymentId = paymentId;

    return wixData.update('Emergency_Profiles', profile, { suppressAuth: true });
  } catch (err) {
    console.error('❌ markSignUpPaid error:', err);
    throw err;
  }
}

/* === Paystack Webhook Handler === */
export async function post_paystack(request) {
  console.log('✅ Paystack webhook received');
  try {
    const secret = await wixSecretsBackend.getSecret('PaystackWebhookSecret');
    if (!secret) throw new Error('PaystackWebhookSecret missing.');

    const rawBody = await request.body.text();
    const signature = request.headers['x-paystack-signature'] || request.headers['X-Paystack-Signature'];
    const cryptoLib = await getCrypto();

    if (cryptoLib && signature) {
      const calc = cryptoLib.createHmac('sha512', secret).update(rawBody).digest('hex');
      if (calc !== signature) return response({ status: 401, body: { error: 'Invalid Paystack signature' } });
    }

    const payload = JSON.parse(rawBody);
    const { event, data } = payload;
    const idempotencyKey = data?.reference || data?.subscription?.subscription_code || data?.id || '';

    // Log event
    await wixData.insert('PaystackEvents', {
      eventType: event,
      eventPayload: payload,
      eventSource: 'Paystack',
      idempotencyKey,
      eventTimestamp: new Date()
    }, { suppressAuth: true });

    // Prevent duplicates
    const existing = await wixData.query('PaystackTransactions').eq('reference', idempotencyKey).find({ suppressAuth: true });
    if (existing.items.length) return ok({ body: { success: true, deduped: true } });

    // Handle events
    if (event === 'charge.success') {
      const metadata = data?.metadata || {};
      const isSignup = metadata?.transaction_type === 'signup_fee';
      const isFirstPayment = metadata?.transaction_type === 'first_payment';

      if (isFirstPayment && typeof handleFirstPaymentSuccess === 'function')
        await handleFirstPaymentSuccess(data);

      if (isSignup && metadata?.userId) {
        await markSignUpPaid(metadata.userId, data.reference);
        if (typeof handleSignUpPaymentSuccess === 'function')
          await handleSignUpPaymentSuccess(data);
      }

      await handleSuccessfulTransaction(data);
      await handleSubscriptionPayment(data);
    } else if (event === 'charge.failed') {
      await handleFailedTransaction(data);
    } else if (event === 'charge.dispute.create') {
      await handleDispute(data);
    } else if (event === 'subscription.disable') {
      await handleSubscriptionDisable(data);
    }

    await wixData.insert('PaystackTransactions', {
      reference: idempotencyKey,
      eventType: event,
      payload,
      processedAt: new Date()
    }, { suppressAuth: true });

    return ok({ body: { success: true } });
  } catch (err) {
    console.error('❌ post_paystack error:', err);
    await sendDiscordLog(`❌ Paystack webhook error: ${err.message}`);
    return serverError({ body: { error: err.message } });
  }
}

/* === PayFast ITN Handler === */
export async function post_payfastWebhook(request) {
  console.log('✅ PayFast ITN received');

  try {
    const rawBody = await request.body.text();
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    console.log('📩 PayFast Params:', params);

    // 1️⃣ Verify IP
    const clientIp = request.headers['x-forwarded-for'] || request.ip;
    if (!PAYFAST_IPS.includes(clientIp)) {
      console.warn('⚠️ Untrusted IP:', clientIp);
      await sendDiscordLog(`⚠️ PayFast ITN rejected from IP: ${clientIp}`);
      return badRequest({ body: { error: 'Untrusted IP' } });
    }

    // 2️⃣ Signature Verification
    const passphrase = await wixSecretsBackend.getSecret('payfast_passphrase');
    const cryptoLib = await getCrypto();
    const signatureString = Object.keys(params)
      .filter(k => k !== 'signature')
      .sort()
      .map(k => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
      .join('&') + (passphrase ? `&passphrase=${encodeURIComponent(passphrase)}` : '');
    const generatedSig = cryptoLib.createHash('md5').update(signatureString).digest('hex');

    if (generatedSig !== params.signature) {
      await sendDiscordLog('⚠️ Invalid PayFast signature');
      return badRequest({ body: { error: 'Invalid signature' } });
    }

    // 3️⃣ Server-to-server validation
    const validationUrl = "https://www.payfast.co.za/eng/query/validate";
    const validationRes = await fetch(validationUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: rawBody
    });
    const validationText = await validationRes.text();
    if (!validationText.includes('VALID')) {
      await sendDiscordLog(`⚠️ PayFast validation failed: ${validationText}`);
      return badRequest({ body: { error: 'Validation failed' } });
    }

    // 4️⃣ Deduplication
    const existing = await wixData.query('PayFast_Transactions')
      .eq('paymentId', params.pf_payment_id)
      .find({ suppressAuth: true });
    if (existing.items.length) return ok({ body: 'Duplicate ignored' });

    // 5️⃣ Mark user profile paid
    const userId = params.m_payment_id;
    await markSignUpPaid(userId, params.pf_payment_id);
    await sendDiscordLog(`✅ PayFast payment confirmed for user ${userId}`);

    // 6️⃣ Save transaction
    await wixData.insert('PayFast_Transactions', {
      paymentId: params.pf_payment_id,
      profileOwner: userId,
      amount: parseFloat(params.amount_gross),
      status: params.payment_status,
      rawPayload: params,
      processedAt: new Date()
    }, { suppressAuth: true });

    return ok({ body: { success: true } });

  } catch (err) {
    console.error('❌ PayFast ITN error:', err);
    await sendDiscordLog(`❌ PayFast ITN error: ${err.message}`);
    return serverError({ body: { error: err.message } });
  }
}

/* === Diagnostics: PayFast config health === */
export async function get_testPayfastConfig(request) {
  try {
    const cfg = await getPayFastConfig();
    const summary = cfg.getConfigSummary ? cfg.getConfigSummary() : { environment: cfg.getEnvironment?.(), paymentUrl: cfg.getPaymentUrl?.() };
    return ok({ body: { ok: true, summary } });
  } catch (err) {
    return serverError({ body: { ok: false, error: err.message } });
  }
}
