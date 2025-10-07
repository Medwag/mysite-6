import wixUsers from 'wix-users';
import wixData from 'wix-data';
import { updateProfile } from 'backend/profile-logger.jsw';

// Build-time stubs (prevent undefined reference errors)
const profile = typeof profile !== 'undefined' ? profile : {};
function generateUniqueId() {
  try { return crypto?.randomUUID ? crypto.randomUUID() : `emergitag-${Date.now()}-${Math.random().toString(36).slice(2,8)}`; }
  catch { return `emergitag-${Date.now()}`; }
}


$w.onReady(async function () {
  const user = wixUsers.currentUser;
  if (!user.loggedIn) return;

  const userId = user.id;
await updateProfile(profile);
  try {
    const existingProfile = await wixData.query("Emergency_Profiles")
      .eq("_owner", userId)
      .limit(1)
      .find();

    if (existingProfile.items.length === 0) {
      await wixData.insert("Emergency_Profiles", {
        signUpPaid: true,
        publicViewId: generateUniqueId(), // You might already have a function for this
        lastUpdated: new Date()
      });
      console.log("✅ Emergency profile created for new user.");
    } else {
      console.log("ℹ️ Profile already exists for user.");
    }
  } catch (err) {
    console.error("❌ Error checking/creating Emergency Profile:", err);
  }
});
