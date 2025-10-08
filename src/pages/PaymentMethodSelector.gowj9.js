// pages/PaymentMethodSelector.js
// Clean, reliable implementation to avoid empty lightbox issues

import wixUsers from 'wix-users';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location';

import { getPaymentMethods, createSignupPaymentWithGateway, getRecommendedPaymentMethod } from 'backend/core/dual-payment-gateway.jsw';
import { getEmergencyProfile } from 'backend/core/profile-service.jsw';
import { createPaystackPayment } from 'backend/paystack.jsw';
import { createPayfastPayment } from 'backend/payfast.jsw';

let selectedGateway = null;
let methods = [];
let ctx = {};

const show = (id) => { try { $w(id).show(); } catch(_){} };
const hide = (id) => { try { $w(id).hide(); } catch(_){} };
const text = (id, t) => { try { $w(id).text = String(t); } catch(_){} };
const label = (id, t) => { try { $w(id).label = String(t); } catch(_){} };
const enable = (id, v=true) => { try { $w(id).enable(); if(!v) $w(id).disable(); } catch(_){} };

function hideAll() {
  ['#paymentContainer','#headerText','#amountText','#selectionText','#paystackButton','#payfastButton','#paystackDetails','#payfastDetails','#methodDetailsContainer','#selectedMethodText','#continueButton','#cancelButton','#errorText','#loadingText']
    .forEach(hide);
}

function showError(message) {
  hideAll();
  text('#errorText', `Error: ${message}`);
  show('#errorText');
  show('#cancelButton');
  try { $w('#cancelButton').onClick(() => wixWindow.lightbox.close({ error: true, message })); } catch(_){}
}

async function processImmediate(gateway) {
  try {
    const user = wixUsers.currentUser;
    const userId = ctx.userId || user.id;
    const email = ctx.email || (await user.getEmail().catch(() => ''));
    let url = '';
    if (gateway === 'paystack') url = await createPaystackPayment(userId, email);
    if (gateway === 'payfast') url = await createPayfastPayment(userId, email);
    if (!url) throw new Error('Could not create payment URL');
    wixLocation.to(url);
  } catch (e) {
    showError(e?.message || 'Could not start payment');
  }
}

function selectMethod(method) {
  selectedGateway = method.id;
  text('#selectedMethodText', `Selected: ${method.name} - ${method.description}`);
  show('#selectedMethodText');
  label('#continueButton', `Pay R149.00 via ${method.name}`);
  show('#continueButton'); enable('#continueButton', true);
}

async function handleContinue() {
  if (!selectedGateway) { showError('Please select a payment method.'); return; }
  try {
    label('#continueButton', 'Creating payment...'); enable('#continueButton', false);
    const user = wixUsers.currentUser;
    const userId = ctx.userId || user.id;
    const email = ctx.email || (await user.getEmail().catch(() => ''));
    const res = await createSignupPaymentWithGateway(userId, selectedGateway, email);
    if (!res?.success) throw new Error(res?.error || 'Payment creation failed');
    wixWindow.lightbox.close({ paymentInitiated: true, gateway: selectedGateway, redirectUrl: res.redirectUrl });
    wixLocation.to(res.redirectUrl);
  } catch (e) {
    showError(e?.message || 'Payment error');
    label('#continueButton', `Pay R149.00 via ${selectedGateway}`); enable('#continueButton', true);
  }
}

$w.onReady(async () => {
  // Lightbox context
  try { ctx = wixWindow.lightbox.getContext() || {}; } catch(_) { ctx = {}; }

  hideAll();
  text('#headerText', 'Choose Your Payment Method'); show('#headerText');
  text('#amountText', 'Signup Fee: R149.00'); show('#amountText');
  text('#selectionText', 'Select your preferred payment method:'); show('#selectionText');
  text('#loadingText', 'Loading payment options...'); show('#loadingText');
  show('#cancelButton'); try { $w('#cancelButton').onClick(() => wixWindow.lightbox.close()); } catch(_){}

  const user = wixUsers.currentUser;
  if (!user || !user.loggedIn) { showError('Please log in to continue with payment.'); return; }

  // Load subscriber details from CMS and display
  try {
    const prof = await getEmergencyProfile(user.id);
    const fullName = prof?.fullName || '';
    const email = prof?.emailAddress || (await user.getEmail().catch(() => '')) || '';
    const phone = prof?.phone || prof?.signUpPhoneNumber || prof?.whatsAppNumber || '';
    const home = prof?.homeAddress || prof?.address1Input || '';
    const delivery = prof?.deliveryAddress || '';
    text('#SubscriberName', fullName);
    text('#SubscriberEmail', email);
    text('#SubscriberPhoneNumber', phone);
    text('#SubscriberHomeAddress', String(home));
    text('#SubscriberDeliveryAddress', String(delivery));
    show('#SubscriberName'); show('#SubscriberEmail'); show('#SubscriberPhoneNumber'); show('#SubscriberHomeAddress'); show('#SubscriberDeliveryAddress');
  } catch (_){ }

  try {
    methods = await getPaymentMethods(user.id);
    hide('#loadingText');
    if (!methods || methods.length === 0) { showError('No payment methods available.'); return; }

    // Wire buttons if they exist
    const ps = methods.find(m => m.id === 'paystack');
    const pf = methods.find(m => m.id === 'payfast');

    if (ps && $w('#paystackButton')) {
      label('#paystackButton', `${ps.name} - ${ps.description}`); show('#paystackButton');
      text('#paystackDetails', `${ps.processingTime} • ${ps.supported?.join(', ') || ''}`); show('#paystackDetails');
      try { $w('#paystackButton').onClick(() => selectMethod(ps)); } catch(_){}
    }
    if (pf && $w('#payfastButton')) {
      label('#payfastButton', `${pf.name} - ${pf.description}`); show('#payfastButton');
      text('#payfastDetails', `${pf.processingTime} • ${pf.supported?.join(', ') || ''}`); show('#payfastDetails');
      try { $w('#payfastButton').onClick(() => selectMethod(pf)); } catch(_){}
    }

    // Continue handler (stay hidden/disabled until a method is selected)
    try { $w('#continueButton').onClick(() => handleContinue()); } catch(_){}

    // Show main container if present
    show('#paymentContainer');

  } catch (e) {
    showError(e?.message || 'Failed to load payment methods.');
  }
});
