// pages/Sign-up.js
import wixUsers from 'wix-users';
import wixLocation from 'wix-location';
import wixWindow from 'wix-window';
import { createPaystackPayment } from 'backend/paystack.jsw';
import { createPayfastPayment } from 'backend/payfast.jsw';
import { getUserPaymentStatus } from 'backend/status.jsw';

const UI = {
  signup: '#openSignUp',
  subscribe: '#goToSubscriptionButton',
  dashboard: '#goToDashboardButton',
  form: '#formContainerdata',
  paystack: '#paystackPaymentButton',
  payfast: '#payfastPaymentButton',
  status: '#membersStatus'
};

const show = id => { try { $w(id).show(); } catch (e) { console.warn('Show fail', id); } };
const hide = id => { try { $w(id).hide(); } catch (e) { console.warn('Hide fail', id); } };
const text = (id, msg) => { try { $w(id).text = msg; } catch (e) { console.warn('Text fail', id); } };
const expand = id => { try { $w(id).expand(); } catch (e) { } };
const collapse = id => { try { $w(id).collapse(); } catch (e) { } };

$w.onReady(async () => {
  const user = wixUsers.currentUser;
  if (!user.loggedIn) {
    text(UI.status, '⚠️ Please log in to continue.');
    return;
  }

  // Hide everything at start
  hide(UI.signup);
  hide(UI.subscribe);
  hide(UI.dashboard);
  collapse(UI.form);

  text(UI.status, 'Checking your membership status...');

  const email = await user.getEmail();
  const status = await getUserPaymentStatus(user.id, email);

  console.log('🧩 Status:', status);

  if (!status.hasSignUpPaid) {
    // ✳️ Not paid signup yet
    show(UI.signup);
    text(UI.status, 'Please complete your sign-up fee to continue.');
  } else if (status.hasSignUpPaid && !status.hasSubscription) {
    // ✳️ Paid signup but no subscription
    show(UI.subscribe);
    text(UI.status, 'Signup confirmed ✅ Choose your membership plan.');
  } else if (status.hasSignUpPaid && status.hasSubscription) {
    // ✳️ Fully subscribed
    show(UI.dashboard);
    text(UI.status, 'Welcome back! You have an active subscription.');
  }

  // Wire up interactions
  $w(UI.signup).onClick(() => {
    $w(UI.form).show('slide', { direction: 'left', duration: 400 });
  });

  $w(UI.paystack).onClick(async () => {
    const url = await createPaystackPayment(user.id, email);
    wixLocation.to(url);
  });

  $w(UI.payfast).onClick(async () => {
    const url = await createPayfastPayment(user.id, email);
    wixLocation.to(url);
  });

  $w(UI.subscribe).onClick(() => wixLocation.to('/subscription'));
  $w(UI.dashboard).onClick(() => wixLocation.to('/dashboard'));
});
