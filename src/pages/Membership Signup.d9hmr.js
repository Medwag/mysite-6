// membersignup page logic (clean implementation)
import wixUsers from 'wix-users';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location';
import wixData from 'wix-data';

import { getUserPaymentStatus } from 'backend/status.jsw';
import { detectSignupPayment } from 'backend/core/payment-service.jsw';
import { getEmergencyProfile, updateEmergencyProfile } from 'backend/core/profile-service.jsw';
import { setSignupPaid } from 'backend/core/signup-utils.jsw';

// Helpers
const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
};
const money = (n) => `R ${Number(n || 0).toFixed(2)}`;
const dateStr = (d) => { try { return new Date(d).toLocaleDateString(); } catch { return ''; } };
const show = (el) => { try { el.show(); } catch(_){} };
const hide = (el) => { try { el.hide(); } catch(_){} };
const setText = (el, t) => { try { el.text = String(t); } catch(_){} };
const setLabel = (el, t) => { try { el.label = String(t); } catch(_) { setText(el, t); } };
const setEnabled = (el, enabled) => { try { el.enabled = !!enabled; } catch(_){} };
const onClick = (el, fn) => { try { el.onClick(fn); } catch(_){} };
const expandOrShow = async (el) => {
  try { if (el.expand) { await el.expand(); } else { await el.show(); } } catch { try { await el.show(); } catch(_){} }
};

async function openSignup() {
  try { await wixWindow.openLightbox('CollectAddresses'); }
  catch { try { await wixWindow.openLightbox('CollectAddresses1'); } catch(_){} }
}

async function ensureCmsSignup(userId, detection) {
  if (!detection?.paymentDetected) return;
  const opts = {
    reference: detection.reference,
    gateway: detection.provider,
    amount: detection.amount,
    date: detection.paymentDate ? new Date(detection.paymentDate) : new Date()
  };
  try {
    await setSignupPaid(userId, opts);
  } catch(_) {
    // Fallback direct update
    const updates = {
      signUpPaid: true,
      signupPaid: true,
      signUpReference: detection.reference,
      signupGateway: detection.provider,
      signupAmount: detection.amount,
      lastPaymentDate: opts.date
    };
    try { await updateEmergencyProfile(userId, updates); } catch(_){}
  }
}

async function renderPlans(cycle) {
  // Expect a repeater with id `#planRepeater` and elements as described
  const repeater = $w('#planRepeater');
  if (!repeater) return;

  const results = await wixData.query('PlanOptions')
    .ascending('sortOrder')
    .find();

  const useAnnual = (cycle === 'Annual');
  repeater.data = results.items.map(it => {
    const monthlyPrice = Number(it.monthlyPrice || 0);
    const annualPrice = Number(it.annualPrice || 0);
    const annualBaseline = monthlyPrice * 12;
    const savingsAmount = Math.max(0, annualBaseline - annualPrice);
    const savingsPercent = annualBaseline > 0 ? Math.round((savingsAmount / annualBaseline) * 100) : 0;

    const selectedPrice = useAnnual ? annualPrice : monthlyPrice;
    let discountText = '';
    if (useAnnual && savingsPercent >= 5) {
      discountText = `Save ${savingsPercent}%`;
    }

    return {
      _id: it._id,
      productImage: it.productImage,
      planName: it.planName || it.title,
      description: it.description,
      priceDisplay: `${money(selectedPrice)} / ${useAnnual ? 'year (billed annually)' : 'month'}`,
      // dual column support
      monthlyDisplay: `${money(monthlyPrice)} / month`,
      annualDisplay: `${money(annualPrice)} / year (billed annually)`,
      savingsAmount,
      savingsPercent,
      discountText,
      image2: it.image2
    };
  });

  repeater.onItemReady(($item, data) => {
    try { $item('#planImage').src = data.productImage; } catch(_){}
    setText($item('#planName'), data.planName || '');
    setText($item('#planDescription'), data.description || '');
    // Single price (legacy or if only one column present)
    setText($item('#planPrice'), data.priceDisplay || '');

    // Dual column prices if elements exist
    try { setText($item('#monthlyPrice'), data.monthlyDisplay); } catch(_){}
    try { setText($item('#annualPrice'), data.annualDisplay); } catch(_){}
    try { if (data.image2) { $item('#discountBadgeimage').src = data.image2; } } catch(_){}
    if (data.discountText) {
      setText($item('#discountBadge'), data.discountText);
      show($item('#discountBadge'));
      try { show($item('#discountBadgeimage')); } catch(_){}
    } else {
      hide($item('#discountBadge'));
      try { hide($item('#discountBadgeimage')); } catch(_){}
    }

    // Optional explicit savings amount element
    try {
      if (data.savingsAmount > 0) {
        setText($item('#annualSavings'), `Save ${money(data.savingsAmount)} annually`);
        show($item('#annualSavings'));
      } else {
        hide($item('#annualSavings'));
      }
    } catch(_){ }
  });
}

$w.onReady(async () => {
  // Elements by ID
  const elUser = $w('#User');
  const elEmail = $w('#Email');
  const elSignUpLink = $w('#signUpLink');
  const elSubscribeLink = $w('#SubscribeLink');
  const elVisitDash = $w('#visitDashLink');
  const elPaySignup = $w('#paySignup');
  const elPlansBlock = $w('#accordionItem7');
  const elBilling = $w('#billingCycleDropdown');
  const elSubscribeBtn = $w('#subscribe');
  const elSubscribeInfo = $w('#subscribeInfo'); // optional text element

  // User context
  const user = wixUsers.currentUser;
  if (!user || !user.loggedIn) {
    setText(elUser, 'Please log in to continue');
    setText(elEmail, '');
    hide(elSignUpLink); hide(elSubscribeLink); hide(elVisitDash); hide(elPaySignup);
    return;
  }

  let email = '';
  try { email = await user.getEmail(); } catch(_){}
  const profile = await getEmergencyProfile(user.id).catch(() => null);
  const name = (profile?.fullName && profile.fullName.trim()) || (email ? email.split('@')[0] : 'Member');
  setText(elUser, `${greet()} ${name}`);
  setText(elEmail, email || '');

  // Determine sign-up and subscription status (PayFast + Paystack + CMS)
  const agg = await getUserPaymentStatus(user.id, email).catch(() => ({}));
  const detection = await detectSignupPayment(user.id, email).catch(() => ({}));
  const signupPaid = !!(agg?.hasSignUpPaid || detection?.paymentDetected);
  const signupAmount = agg?.signupAmount || detection?.amount || 150;
  const signupDate = agg?.signupDate || detection?.paymentDate || new Date();
  const hasSub = !!(agg?.hasSubscription);

  // If detection found proof, ensure CMS reflects it
  if (detection?.paymentDetected) { await ensureCmsSignup(user.id, detection); }

  // a) signUpLink behavior
  if (!signupPaid) {
    if (elSignUpLink) { setLabel(elSignUpLink, 'Complete Sign Up'); show(elSignUpLink); setEnabled(elSignUpLink, true); onClick(elSignUpLink, openSignup); }
  } else {
    if (elSignUpLink) { setLabel(elSignUpLink, `Sign Up fee: ${money(signupAmount)} was paid on ${dateStr(signupDate)}`); setEnabled(elSignUpLink, false); show(elSignUpLink); }
  }

  // paySignup button in top accordion block
  if (!signupPaid) {
    if (elPaySignup) { setLabel(elPaySignup, 'Pay Sign Up Fee'); show(elPaySignup); setEnabled(elPaySignup, true); onClick(elPaySignup, openSignup); }
  } else {
    if (elPaySignup) { setLabel(elPaySignup, 'SIGNUP PAID'); setEnabled(elPaySignup, false); show(elPaySignup); }
  }

  // Middle block subscribe button
  if (elSubscribeBtn) {
    if (!signupPaid) {
      hide(elSubscribeBtn);
      if (elSubscribeInfo) { setText(elSubscribeInfo, 'Please sign up'); show(elSubscribeInfo); }
    } else {
      show(elSubscribeBtn);
      onClick(elSubscribeBtn, async () => { if (elPlansBlock) await expandOrShow(elPlansBlock); });
      if (elSubscribeInfo) hide(elSubscribeInfo);
    }
  }

  // SubscribeLink (if also present)
  if (elSubscribeLink) {
    if (signupPaid && !hasSub) {
      setLabel(elSubscribeLink, 'Subscribe to a Plan'); show(elSubscribeLink); setEnabled(elSubscribeLink, true);
      onClick(elSubscribeLink, async () => { if (elPlansBlock) await expandOrShow(elPlansBlock); });
    } else if (!signupPaid) {
      hide(elSubscribeLink);
    } else {
      hide(elSubscribeLink);
    }
  }

  // Dashboard link visible only when subscribed
  if (elVisitDash) { if (hasSub) { show(elVisitDash); onClick(elVisitDash, () => wixLocation.to('/dashboard')); } else { hide(elVisitDash); } }

  // Plans rendering + billing cycle toggle
  const initialCycle = elBilling && elBilling.value ? elBilling.value : 'Monthly';
  await renderPlans(initialCycle);
  if (elBilling) { elBilling.onChange(async () => { await renderPlans(elBilling.value || 'Monthly'); }); }
});
