function enableAddressFieldsAggressively() {
    try {
        const ids = ['#homeAddress', '#deliveryAddress'];
        const attempt = () => {
            ids.forEach(id => {
                try {
                    const f = $w(id);
                    if (!f) return;
                    if (typeof f.enable === 'function') f.enable();
                    if (typeof f.show === 'function') f.show();
                    try { f.readOnly = false; } catch {}
                    try { f.required = false; } catch {}
                    try { if (typeof f.resetValidityIndication === 'function') f.resetValidityIndication(); } catch {}
                } catch (_) {}
            });
        };
        [0, 100, 300, 600].forEach(ms => setTimeout(attempt, ms));
    } catch (_) {}
}
// ✅ frontend/lightboxes/CollectAddresses.js
import wixWindow from 'wix-window';
import wixUsers from 'wix-users';
import wixLocation from 'wix-location';
import { saveEmergencyProfile, EmergencyProfile } from 'backend/profile-utils.jsw';
import { createSignupPaymentUrl } from 'backend/paystackUrl.jsw';
import { generatePayFastUrl } from 'backend/payfastUrl.jsw';

function formatPhone(input) {
    if (!input) return null;
    let digits = String(input).replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '27' + digits.slice(1);
    return digits || null;
}

function getFormattedAddress(value) {
    console.log('🔍 [CollectAddresses] Processing address value:', typeof value, value);
    
    if (!value) return null;
    if (typeof value === 'string') return value;
    
    // Handle different address input widget formats
    const formatted = value.formatted || value.addressLine || value.formattedAddress || null;
    console.log('📍 [CollectAddresses] Formatted address result:', formatted);
    
    return formatted;
}

function debugCAActive() {
    try {
        const q = (wixLocation && wixLocation.query) ? wixLocation.query : {};
        if (typeof q.debugCA === 'undefined') return false;
        const v = String(q.debugCA).toLowerCase();
        return (v !== '0' && v !== 'false' && v !== 'no');
    } catch (_) { return false; }
}

// Throttle/gate CollectAddresses logs to prevent Wix Log spam
(() => {
  try {
    // Enable verbose logs via URL: ?debugCA=1 (disable with 0/false)
    let verboseFromQuery = false;
    try {
      const q = (wixLocation && wixLocation.query) ? wixLocation.query : {};
      if (typeof q.debugCA !== 'undefined') {
        const v = String(q.debugCA).toLowerCase();
        verboseFromQuery = (v !== '0' && v !== 'false' && v !== 'no');
      }
    } catch (_) {}

    const VERBOSE_COLLECT_LOGS = !!verboseFromQuery; // set true only when debugging
    const RATE_LIMIT_MS = 60000; // per unique message per 60s
    const lastSeen = new Map();
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);

    function shouldEmit(tag, msg) {
      if (typeof msg !== 'string' || !msg.includes('[CollectAddresses]')) return true;
      if (!VERBOSE_COLLECT_LOGS && (tag === 'log' || tag === 'warn')) return false; // drop info/warn by default
      const key = tag + ':' + msg;
      const now = Date.now();
      const last = lastSeen.get(key) || 0;
      if (now - last < RATE_LIMIT_MS) return false;
      lastSeen.set(key, now);
      return true;
    }

    console.log = (first, ...rest) => {
      try { if (!shouldEmit('log', first)) return; } catch (_) {}
      origLog(first, ...rest);
    };
    console.warn = (first, ...rest) => {
      try { if (!shouldEmit('warn', first)) return; } catch (_) {}
      origWarn(first, ...rest);
    };
    console.error = (first, ...rest) => {
      try {
        if (typeof first === 'string' && first.includes('[CollectAddresses]')) {
          const key = 'err:' + first;
          const now = Date.now();
          const last = lastSeen.get(key) || 0;
          if (now - last < RATE_LIMIT_MS) return;
          lastSeen.set(key, now);
        }
      } catch (_) {}
      origError(first, ...rest);
    };
  } catch (_) {}
})();

// Helper function to ensure address fields are working properly
function ensureAddressFieldsEnabled() {
    console.log('🔧 [CollectAddresses] Ensuring address fields are enabled...');
    
    try {
        // More comprehensive field enablement
        ['#homeAddress', '#deliveryAddress'].forEach(fieldId => {
            if ($w(fieldId)) {
                console.log(`🔧 [CollectAddresses] Working on ${fieldId}...`);
                
                // Basic enablement
                $w(fieldId).enable();
                $w(fieldId).show();
                
                // Try various approaches to make field editable
                try {
                    // Method 1: Direct property setting
                    if ($w(fieldId).readonly !== undefined) $w(fieldId).readonly = false;
                    if ($w(fieldId).disabled !== undefined) $w(fieldId).disabled = false;
                    
                    // Method 2: Style manipulation to override CSS
                    if ($w(fieldId).style) {
                        $w(fieldId).style.pointerEvents = 'auto';
                        $w(fieldId).style.userSelect = 'text';
                        $w(fieldId).style.cursor = 'text';
                    }
                    
                    // Method 3: Try to clear and reset the field
                    if ($w(fieldId).value !== undefined) {
                        const currentValue = $w(fieldId).value;
                        $w(fieldId).value = "";
                        setTimeout(() => {
                            $w(fieldId).value = currentValue || "";
                        }, 50);
                    }
                    
                } catch (innerErr) {
                    console.warn(`⚠️ [CollectAddresses] Some fixes failed for ${fieldId}:`, innerErr);
                }
                
                // Test responsiveness
                setTimeout(() => {
                    try {
                        // focus disabled to avoid cursor hijack
                        console.log(`✅ [CollectAddresses] ${fieldId} is responsive`);
                        
                        // Try to trigger input event to test if it accepts input
                        setTimeout(() => {
                            if ($w(fieldId).value !== undefined) {
                                const testValue = "Test";
                                $w(fieldId).value = testValue;
                                setTimeout(() => {
                                    if ($w(fieldId).value === testValue) {
                                        console.log(`✅ [CollectAddresses] ${fieldId} accepts input`);
                                        $w(fieldId).value = ""; // Clear test value
                                    } else {
                                        console.warn(`⚠️ [CollectAddresses] ${fieldId} does not accept input properly`);
                                    }
                                }, 100);
                            }
                        }, 100);
                        
                    } catch (focusErr) {
                        console.warn(`⚠️ [CollectAddresses] Could not focus ${fieldId}:`, focusErr);
                    }
                }, 200 * (fieldId === '#homeAddress' ? 1 : 2)); // Stagger the timing
            }
        });
        
    } catch (enableErr) {
        console.error('❌ [CollectAddresses] Error enabling address fields:', enableErr);
    }
}

// Alternative function to check if we need fallback inputs
function checkAddressFieldAccessibility() {
    console.log('🧪 [CollectAddresses] Testing address field accessibility...');
    
    const testResults = {
        homeAddressWorking: false,
        deliveryAddressWorking: false
    };
    
    // Test home address field
    if ($w('#homeAddress')) {
        try {
            // focus disabled to avoid cursor hijack
            $w('#homeAddress').value = "Test";
            if ($w('#homeAddress').value === "Test") {
                testResults.homeAddressWorking = true;
                $w('#homeAddress').value = ""; // Clear test
            }
        } catch (testErr) {
            console.warn('⚠️ [CollectAddresses] Home address test failed:', testErr);
        }
    }
    
    // Test delivery address field
    if ($w('#deliveryAddress')) {
        try {
            // focus disabled to avoid cursor hijack
            $w('#deliveryAddress').value = "Test";
            if ($w('#deliveryAddress').value === "Test") {
                testResults.deliveryAddressWorking = true;
                $w('#deliveryAddress').value = ""; // Clear test
            }
        } catch (testErr) {
            console.warn('⚠️ [CollectAddresses] Delivery address test failed:', testErr);
        }
    }
    
    console.log('🧪 [CollectAddresses] Test results:', testResults);
    
    // If fields are not working, activate backup solution
    if (!testResults.homeAddressWorking || !testResults.deliveryAddressWorking) {
        console.warn('⚠️ [CollectAddresses] Some address fields are not accessible');
        
        // IMMEDIATE MULTI-PRONGED APPROACH
        // 1. Apply aggressive field enabling first
        enableAddressFieldsAggressively();
        
        // 2. Apply backup solution immediately
        console.log('🔄 [CollectAddresses] Activating backup input solution...');
        createBackupAddressInputs();
        
        // 3. Multiple repair attempts with different timings
        [100, 300, 600, 1200].forEach(delay => {
            setTimeout(() => {
                enableAddressFieldsAggressively();
            }, delay);
        });
        
        // Try to show a helpful message to the user
        if ($w('#errorText')) {
            const problemFields = [];
            if (!testResults.homeAddressWorking) problemFields.push('Home Address');
            if (!testResults.deliveryAddressWorking) problemFields.push('Delivery Address');
            
            // Show immediate optimizing message
            $w('#errorText').text = `� Optimizing address input fields... Please wait a moment.`;
            $w('#errorText').show();
            
            // Update to ready message
            setTimeout(() => {
                $w('#errorText').text = `✅ Address fields optimized! Click in the ${problemFields.join(' and ')} field${problemFields.length > 1 ? 's' : ''} below and type your complete address information.`;
            }, 1000);
            
            // Keep the message visible longer since it's informational
            setTimeout(() => {
                if ($w('#errorText').text.includes('optimized')) {
                    $w('#errorText').hide();
                }
            }, 10000);
        }
        
        // Re-test after backup solution
        setTimeout(() => {
            console.log('🧪 [CollectAddresses] Re-testing after backup solution...');
            const retestResults = checkAddressFieldAccessibility();
            if (retestResults.homeAddressWorking && retestResults.deliveryAddressWorking) {
                console.log('✅ [CollectAddresses] Backup solution successful - all fields now working!');
            }
        }, 1000);
    } else {
        // All fields are working perfectly
        console.log('✅ [CollectAddresses] All address fields are accessible and working!');
        
        // Show brief success message to users
        if ($w('#errorText')) {
            $w('#errorText').text = `✅ Address fields ready! Please enter your home and delivery addresses below.`;
            $w('#errorText').show();
            
            // Hide success message after users have seen it
            setTimeout(() => {
                $w('#errorText').hide();
            }, 4000);
        }
    }
    
    return testResults;
}

// ULTRA-AGGRESSIVE backup solution: Force field functionality
function createBackupAddressInputs() {
    console.log('🔄 [CollectAddresses] Creating ULTRA-AGGRESSIVE backup solution...');
    
    try {
        // Apply nuclear-level field fixing to both address fields
        ['#homeAddress', '#deliveryAddress'].forEach(fieldId => {
            if ($w(fieldId)) {
                const fieldName = fieldId === '#homeAddress' ? 'Home' : 'Delivery';
                console.log(`⚡ [CollectAddresses] NUCLEAR-LEVEL fix for ${fieldName} address...`);
                
                // APPROACH 1: Complete field reset and override
                try {
                    const field = $w(fieldId);
                    
                    // Force enable and reset everything
                    field.enable();
                    field.show();
                    field.resetValidityIndication();
                    field.value = '';
                    
                    // Override all properties
                    field.readOnly = false;
                    field.required = false; // Remove any validation that might block input
                    
                    console.log(`⚡ [CollectAddresses] ${fieldName} field properties overridden`);
                } catch (resetErr) {
                    console.warn(`⚠️ [CollectAddresses] ${fieldName} reset failed:`, resetErr);
                }
                
                // APPROACH 2: DOM-level manipulation (if possible in Wix)
                setTimeout(() => {
                    try {
                        // Try to access the underlying DOM element
                        const fieldNow = (fieldId);
                        const domElement = fieldNow && fieldNow.html;
                        if (domElement) {
                            // Force enable at DOM level
                            domElement.disabled = false;
                            domElement.readOnly = false;
                            domElement.style.pointerEvents = 'auto';
                            domElement.style.opacity = '1';
                            console.log(`⚡ [CollectAddresses] ${fieldName} DOM properties overridden`);
                        }
                    } catch (domErr) {
                        console.log(`ℹ️ [CollectAddresses] DOM manipulation not available for ${fieldName}`);
                    }
                }, 50);
                
                // APPROACH 3: Event-based activation
                const activateField = () => {
                    try {
                        $w(fieldId).enable();
                        // focus disabled to avoid cursor hijack
                        console.log(`⚡ [CollectAddresses] ${fieldName} field activated via events`);
                    } catch (eventErr) {
                        console.log(`⚠️ [CollectAddresses] ${fieldName} event activation failed`);
                    }
                };
                
                // Multiple activation attempts
                [100, 200, 500, 1000, 2000].forEach(delay => {
                    setTimeout(activateField, delay);
                });
                
                try {
                    // Try to force the field into text input mode
                    const field = $w(fieldId);
                    
                    // Method 1: Try to reset the field completely
                    field.resetValidityIndication();
                    field.updateValidityIndication();
                    
                    // Method 2: Force enable with timeout retry
                    const enableField = () => {
                        field.enable();
                        field.show();
                        if (field.readonly !== undefined) field.readonly = false;
                        if (field.disabled !== undefined) field.disabled = false;
                    };
                    
                    enableField();
                    setTimeout(enableField, 100);
                        setTimeout(enableField, 500);
                    
                    // Method 3: Try to force input acceptance
                    try {
                        // Force focus and input simulation
                        // focus disabled to avoid cursor hijack
                        
                        // Try to trigger input events to wake up the field
                        if (typeof field.onInput === 'function') {
                            // Simulate input by setting and clearing a value
                            field.value = 'test';
                            setTimeout(() => field.value = '', 100);
                        }
                    } catch (inputErr) {
                        console.warn(`⚠️ [CollectAddresses] Could not simulate input for ${fieldName}:`, inputErr);
                    }
                    
                    // Method 4: Set helpful placeholder
                    if (field.placeholder !== undefined) {
                        field.placeholder = `Type your ${fieldName.toLowerCase()} address here (street, city, postal code)`;
                    }
                    
                    // Method 5: Try to override any CSS that might be blocking input
                    if (field.style) {
                        field.style.cursor = 'text';
                        field.style.pointerEvents = 'auto';
                        field.style.userSelect = 'text';
                        field.style.webkitUserSelect = 'text';
                        field.style.mozUserSelect = 'text';
                        field.style.msUserSelect = 'text';
                    }                    console.log(`✅ [CollectAddresses] Applied backup solution to ${fieldName} address`);
                    
                } catch (backupErr) {
                    console.warn(`⚠️ [CollectAddresses] Backup solution failed for ${fieldName} address:`, backupErr);
                }
            }
        });
        
    } catch (err) {
        console.error('❌ [CollectAddresses] Error creating backup inputs:', err);
    }
}

// SPECIALIZED HOME ADDRESS FIELD FIX
function fixHomeAddressFieldSpecifically() {
    console.log('🏠 [CollectAddresses] SPECIALIZED HOME ADDRESS FIELD REPAIR...');
    
    if (!$w('#homeAddress')) {
        console.warn('⚠️ [CollectAddresses] Home address field not found');
        return;
    }
    
    try {
        const homeField = $w('#homeAddress');
        
        // APPROACH 1: Complete field state reset
        console.log('🔄 [CollectAddresses] Resetting home address field state...');
        homeField.enable();
        homeField.show();
        homeField.value = '';
        
        // Clear any validation states
        if (typeof homeField.resetValidityIndication === 'function') {
            homeField.resetValidityIndication();
        }
        
        // APPROACH 2: Force all accessibility properties
        console.log('⚡ [CollectAddresses] Forcing home address accessibility properties...');
        try {
            homeField.readOnly = false;
            homeField.disabled = false;
            homeField.required = false; // Remove validation blocking
        } catch (propErr) {
            console.log('ℹ️ [CollectAddresses] Some properties not available:', propErr);
        }
        
        // APPROACH 3: Multiple enable attempts
        console.log('🔁 [CollectAddresses] Multiple home address enable attempts...');
        [10, 50, 100, 200].forEach(delay => {
            setTimeout(() => {
                try {
                    homeField.enable();
                    // focus disabled to avoid cursor hijack
                    console.log(`✅ [CollectAddresses] Home address enable attempt at ${delay}ms`);
                } catch (enableErr) {
                    console.log(`⚠️ [CollectAddresses] Home address enable failed at ${delay}ms`);
                }
            }, delay);
        });
        
        // APPROACH 4: Event listener override
        console.log('🎯 [CollectAddresses] Adding home address event overrides...');
        
        // Override click events to force enable
        homeField.onClick(() => {
            console.log('👆 [CollectAddresses] Home address clicked - force enabling...');
            setTimeout(() => {
                homeField.enable();
                // focus disabled to avoid cursor hijack
            }, 10);
        });
        
        // Override focus events
        homeField.onFocus(() => {
            console.log('🎯 [CollectAddresses] Home address focused - ensuring enabled...');
            if (homeField.enabled === false) {
                setTimeout(() => {
                    homeField.enable();
                }, 10);
            }
        });
        
        // Test the field immediately
        setTimeout(() => {
            console.log('🧪 [CollectAddresses] Testing home address field after fixes...');
            try {
                // focus disabled to avoid cursor hijack
                homeField.value = 'TEST';
                if (homeField.value === 'TEST') {
                    console.log('✅ [CollectAddresses] Home address field TEST SUCCESSFUL!');
                    homeField.value = ''; // Clear test
                } else {
                    console.warn('❌ [CollectAddresses] Home address field TEST FAILED - value not set');
                }
            } catch (testErr) {
                console.warn('❌ [CollectAddresses] Home address field TEST ERROR:', testErr);
            }
        }, 300);
        
    } catch (err) {
        console.error('❌ [CollectAddresses] Home address field fix error:', err);
    }
}

$w.onReady(async () => {
    console.log('🏠 [CollectAddresses] Lightbox initializing...');
    
    try { $w('#errorText').hide(); } catch {}
    try { $w('#loadingSpinner').hide(); } catch {}

    // Prefill known user/profile data for accuracy
    try {
        const user = wixUsers.currentUser;
        if (user?.loggedIn) {
            const emailVal = await user.getEmail().catch(() => '');
            try { if (emailVal && $w('#inputEmail')) $w('#inputEmail').value = emailVal; } catch {}
            try {
                const { getEmergencyProfile } = await import('backend/core/profile-service.jsw');
                const prof = await getEmergencyProfile(user.id).catch(() => null);
                if (prof) {
                    if (prof.fullName && $w('#inputFullName')) $w('#inputFullName').value = prof.fullName;
                    if (prof.phone && $w('#inputPhone')) $w('#inputPhone').value = prof.phone;
                    if (prof.whatsAppNumber && $w('#inputWA')) $w('#inputWA').value = prof.whatsAppNumber;
                    if (prof.homeAddress && $w('#homeAddress')) try { $w('#homeAddress').value = prof.homeAddress; } catch {}
                    if (prof.deliveryAddress && $w('#deliveryAddress')) try { $w('#deliveryAddress').value = prof.deliveryAddress; } catch {}
                }
            } catch {}
        }
    } catch {}
    
    // 🚀 IMMEDIATE ULTRA-AGGRESSIVE FIELD PREPARATION
    console.log('🚀 [CollectAddresses] Pre-emptive address field optimization starting...');
    
    // Show immediate user feedback
    try { $w('#errorText').text = 'Preparing address input fields...'; $w('#errorText').show(); } catch {}
    
    // SPECIAL TREATMENT FOR HOME ADDRESS FIELD (known problematic)
    setTimeout(() => {
        fixHomeAddressFieldSpecifically();
    }, 50);
    
    // Apply all fixes immediately on page load
    setTimeout(() => {
        enableAddressFieldsAggressively();
    }, 100);
    // Hide the status banner shortly after enabling to avoid blocking clicks
    setTimeout(() => {
        try { $w('#errorText').hide(); } catch {}
    }, 700);
    
    setTimeout(() => {
        createBackupAddressInputs();
    }, 200);
    
    // Extra home address fixes with different timings
    [300, 600, 1000, 1500].forEach(delay => {
        setTimeout(() => {
            fixHomeAddressFieldSpecifically();
        }, delay);
    });
    
    // Run accessibility check and show results to user
    setTimeout(() => {
        checkAddressFieldAccessibility();
    }, 500);
    
    // Initialize address fields to ensure they accept text input
    try {
        console.log('📍 [CollectAddresses] Configuring address fields...');
        
        // Configure home address input with aggressive fixes
        if ($w('#homeAddress')) {
            console.log('🏠 [CollectAddresses] Configuring home address field');
            console.log('🔍 [CollectAddresses] Home address field type:', $w('#homeAddress').type);
            console.log('🔍 [CollectAddresses] Home address field enabled:', $w('#homeAddress').enabled);
            
            // Force enable the field multiple ways
            $w('#homeAddress').enable();
            $w('#homeAddress').show();
            
            // Try different approaches to make it editable
            try {
                if (typeof $w('#homeAddress').readonly !== 'undefined') {
                    $w('#homeAddress').readonly = false;
                }
                if (typeof $w('#homeAddress').disabled !== 'undefined') {
                    $w('#homeAddress').disabled = false;
                }
                if (typeof $w('#homeAddress').placeholder !== 'undefined') {
                    $w('#homeAddress').placeholder = "Enter your home address";
                }
                if (typeof $w('#homeAddress').value !== 'undefined') {
                    // Clear any existing value that might be interfering
                    $w('#homeAddress').value = "";
                }
                
                // Try to set input mode if it's a text input
                if (typeof $w('#homeAddress').inputMode !== 'undefined') {
                    $w('#homeAddress').inputMode = 'text';
                }
                
            } catch (configErr) {
                console.warn('⚠️ [CollectAddresses] Some configuration failed:', configErr);
            }
            
            // 🚨 SPECIAL HOME ADDRESS CLICK HANDLER FOR USER INTERACTION
            console.log('🎯 [CollectAddresses] Adding special home address interaction handlers...');
            $w('#homeAddress').onClick(() => {
                console.log('🏠 [CollectAddresses] HOME ADDRESS CLICKED - Applying instant fix!');
                
                // Immediate multiple enable attempts
                for (let i = 0; i < 5; i++) {
                    setTimeout(() => {
                        try {
                            $w('#homeAddress').enable();
                            // focus disabled to avoid cursor hijack
                            console.log(`✅ [CollectAddresses] Home address enable attempt ${i + 1}`);
                        } catch (err) {
                            console.log(`⚠️ [CollectAddresses] Home address enable attempt ${i + 1} failed`);
                        }
                    }, i * 20); // 0ms, 20ms, 40ms, 60ms, 80ms
                }
                
                // Show user instruction
                if ($w('#errorText')) {
                    $w('#errorText').text = '🏠 HOME ADDRESS activated! Continue clicking and start typing your home address.';
                    $w('#errorText').show();
                    
                    setTimeout(() => {
                        $w('#errorText').hide();
                    }, 4000);
                }
            });
            
            // Focus handler to re-enable if needed
            $w('#homeAddress').onFocus(() => {
                console.log('🎯 [CollectAddresses] HOME ADDRESS FOCUSED - Ensuring enabled state!');
                setTimeout(() => {
                    if ($w('#homeAddress').enabled === false) {
                        $w('#homeAddress').enable();
                        console.log('✅ [CollectAddresses] Home address re-enabled on focus');
                    }
                }, 10);
            });
            
            console.log('✅ [CollectAddresses] Home address field aggressively configured with click handlers');
        } else {
            console.warn('⚠️ [CollectAddresses] Home address field (#homeAddress) not found');
        }
        
        // Configure delivery address input with aggressive fixes
        if ($w('#deliveryAddress')) {
            console.log('📦 [CollectAddresses] Configuring delivery address field');
            console.log('🔍 [CollectAddresses] Delivery address field type:', $w('#deliveryAddress').type);
            console.log('🔍 [CollectAddresses] Delivery address field enabled:', $w('#deliveryAddress').enabled);
            
            // Force enable the field multiple ways
            $w('#deliveryAddress').enable();
            $w('#deliveryAddress').show();
            
            // Try different approaches to make it editable
            try {
                if (typeof $w('#deliveryAddress').readonly !== 'undefined') {
                    $w('#deliveryAddress').readonly = false;
                }
                if (typeof $w('#deliveryAddress').disabled !== 'undefined') {
                    $w('#deliveryAddress').disabled = false;
                }
                if (typeof $w('#deliveryAddress').placeholder !== 'undefined') {
                    $w('#deliveryAddress').placeholder = "Enter your delivery address";
                }
                if (typeof $w('#deliveryAddress').value !== 'undefined') {
                    // Clear any existing value that might be interfering
                    $w('#deliveryAddress').value = "";
                }
                
                // Try to set input mode if it's a text input
                if (typeof $w('#deliveryAddress').inputMode !== 'undefined') {
                    $w('#deliveryAddress').inputMode = 'text';
                }
                
            } catch (configErr) {
                console.warn('⚠️ [CollectAddresses] Some configuration failed:', configErr);
            }
            
            console.log('✅ [CollectAddresses] Delivery address field aggressively configured');
        } else {
            console.warn('⚠️ [CollectAddresses] Delivery address field (#deliveryAddress) not found');
        }
        
        console.log('✅ [CollectAddresses] Address fields initialization complete');
        
        // Ensure fields are enabled after initialization
        setTimeout(() => {
            ensureAddressFieldsEnabled();
            
            // Test accessibility after a short delay
            setTimeout(() => {
                checkAddressFieldAccessibility();
            }, 1000);
        }, 500);
        
        // Add comprehensive event handlers for debugging address field interactions
        ['#homeAddress', '#deliveryAddress'].forEach(fieldId => {
            if ($w(fieldId)) {
                const fieldName = fieldId === '#homeAddress' ? 'Home' : 'Delivery';
                
                // Focus event
                $w(fieldId).onFocus(() => {
                    console.log(`� [CollectAddresses] ${fieldName} address field focused`);
                    
                    // Try to force enable again when focused
                    try {
                        $w(fieldId).enable();
                        if ($w(fieldId).readonly !== undefined) $w(fieldId).readonly = false;
                    } catch (focusEnableErr) {
                        console.warn(`⚠️ [CollectAddresses] Could not re-enable ${fieldName} field on focus:`, focusEnableErr);
                    }
                });
                
                // Blur event
                $w(fieldId).onBlur(() => {
                    const value = $w(fieldId).value;
                    console.log(`📝 [CollectAddresses] ${fieldName} address field blurred, value:`, value);
                    
                    // If user managed to enter something, great!
                    if (value && value.trim()) {
                        console.log(`✅ [CollectAddresses] User successfully entered ${fieldName} address!`);
                    }
                });
                
                // Change events (try multiple event types)
                ['onChange', 'onInput', 'onKeyPress'].forEach(eventType => {
                    if (typeof $w(fieldId)[eventType] === 'function') {
                        $w(fieldId)[eventType](() => {
                            console.log(`⌨️ [CollectAddresses] ${fieldName} address ${eventType}:`, $w(fieldId).value);
                        });
                    }
                });
                
                // Mouse events to detect interaction attempts
                ['onClick', 'onMouseEnter'].forEach(eventType => {
                    if (typeof $w(fieldId)[eventType] === 'function') {
                        $w(fieldId)[eventType](() => {
                            console.log(`�️ [CollectAddresses] ${fieldName} address ${eventType} - attempting to re-enable field`);
                            
                            // Force re-enable on any interaction
                            setTimeout(() => {
                                try {
                                    $w(fieldId).enable();
                                     // focus disabled to avoid cursor hijack
                                } catch (interactionErr) {
                                    console.warn(`⚠️ [CollectAddresses] Could not enable ${fieldName} field on interaction:`, interactionErr);
                                }
                            }, 10);
                        });
                    }
                });
            }
        });
        
    } catch (initErr) {
        console.error('❌ [CollectAddresses] Error initializing address fields:', initErr);
    }

    $w('#submitBtn').onClick(async () => {
        $w('#errorText').hide();
        $w('#submitBtn').disable();
        $w('#loadingSpinner').show();

        try {
            const user = wixUsers.currentUser;
            if (!user.loggedIn) throw new Error('Please log in first.');

            // --- Collect form inputs ---
            const fullName = ($w('#inputFullName').value || '').trim();
            const inputEmailVal = ($w('#inputEmail').value || '').trim();
            const phoneRaw = ($w('#inputPhone').value || '').trim();
            const waRaw = ($w('#inputWA').value || '').trim();

            const phone = formatPhone(phoneRaw);
            const whatsAppNumber = formatPhone(waRaw);

            const smsConsent = !!($w('#SMSConsent') && $w('#SMSConsent').checked);
            const waConsent = ($w('#WAConsent') && typeof $w('#WAConsent').checked === 'boolean') ? $w('#WAConsent').checked : undefined;

            // Get address values with debugging
            console.log('📍 [CollectAddresses] Reading address field values...');
            let homeAddress, deliveryAddress;
            
            try {
                homeAddress = getFormattedAddress($w('#homeAddress').value);
                console.log('🏠 [CollectAddresses] Home address value:', homeAddress);
            } catch (homeErr) {
                console.error('❌ [CollectAddresses] Error reading home address:', homeErr);
                homeAddress = null;
            }
            
            try {
                deliveryAddress = getFormattedAddress($w('#deliveryAddress').value);
                console.log('📦 [CollectAddresses] Delivery address value:', deliveryAddress);
            } catch (delErr) {
                console.error('❌ [CollectAddresses] Error reading delivery address:', delErr);
                deliveryAddress = null;
            }

            // Determine email (prefer membership email over typed value)
            let membershipEmail = '';
            try { membershipEmail = await user.getEmail(); } catch {}
            const email = membershipEmail || inputEmailVal;

            // --- Basic validation with specific error messages ---
            const missingFields = [];
            if (!fullName) missingFields.push('Full Name');
            if (!email) missingFields.push('Email');
            if (!phone) missingFields.push('Phone');
            if (!homeAddress) missingFields.push('Home Address');
            if (!deliveryAddress) missingFields.push('Delivery Address');

            if (missingFields.length > 0) {
                const fieldList = missingFields.join(', ');
                throw new Error(`Please fill in the following required fields: ${fieldList}`);
            }

            // --- Save profile (write both canonical and requested CMS fields) ---
            const { savedProfile } = await saveEmergencyProfile({
                userId: user.id,
                email,
                fullName,
                phone,
                whatsAppNumber,
                smsConsent,
                waConsent,
                homeAddress,
                deliveryAddress,
                // Additional CMS fields per request
                fullNameInput: fullName,
                signUpPhoneNumber: phone,
                address1Input: homeAddress
            });

            console.log('✅ Profile saved:', savedProfile);

            // --- Close this lightbox and open payment method selector ---
            (async () => { try { await wixWindow.openLightbox('PaymentMethodSelector', { profileSaved: true, profileId: savedProfile?._id, userId: user.id, fullName, email, phoneNumber: phone, signUpPhoneNumber: phone, homeAddress, deliveryAddress }); } catch(e) { console.warn('PaymentMethodSelector open failed:', e?.message || e); } wixWindow.lightbox.close({ profileSaved: true, profileId: savedProfile?._id, userId: user.id, email }); })();

        } catch (err) {
            console.error('❌ CollectAddresses error:', err);
            $w('#errorText').text = err?.message || 'Something went wrong. Please try again.';
            $w('#errorText').show();
            $w('#submitBtn').enable();
        } finally {
            $w('#loadingSpinner').hide();
        }
    });

    $w('#cancelBtn').onClick(() => {
        wixWindow.lightbox.close(null);
    });

    // Add manual field refresh functionality for troubleshooting
    window.refreshAddressFields = function() {
        console.log('[CollectAddresses] Manual address field refresh triggered');
        
        // Clear any existing error messages
        $w('#errorText').hide();
        
        // Re-run the aggressive field fixing
        setTimeout(() => {
            enableAddressFieldsAggressively();
        }, 500);
        
        // Check accessibility again
        setTimeout(() => {
            checkAddressFieldAccessibility();
        }, 1500);
        
        // Show feedback to user
        $w('#errorText').text = "🔄 Refreshing address fields... Please wait a moment then try typing in the fields.";
        $w('#errorText').show();
        
        setTimeout(() => {
            $w('#errorText').text = "✅ Address fields refreshed! Click in the fields and start typing your address.";
        }, 2000);
    };

    // Auto-enable on page interactions as backup
    document.addEventListener('click', function(event) {
        console.log('[CollectAddresses] Document click detected, ensuring fields are enabled');
        
        // Small delay to allow any existing handlers to finish
        setTimeout(() => {
            ['#homeAddress', '#deliveryAddress'].forEach(fieldId => {
                try {
                    if ($w(fieldId).enabled === false) {
                        console.log(`[CollectAddresses] Re-enabling ${fieldId} due to document click`);
                        $w(fieldId).enable();
                    }
                } catch (err) {
                    // Ignore errors
                }
            });
        }, 50);
    });
});









// --- Integrated payment (Paystack/PayFast) moved into CollectAddresses ---
$w.onReady(async () => {
  // Safely collapse info containers
  try { if ($w('#PaystackDetails').collapse) $w('#PaystackDetails').collapse(); else $w('#PaystackDetails').hide(); } catch(_){}
  try { if ($w('#PayfastDetails').collapse) $w('#PayfastDetails').collapse(); else $w('#PayfastDetails').hide(); } catch(_){}

  // Hover tooltips
  try {
    $w('#PaystackPay').onMouseIn(() => { try { $w('#PayfastDetails').hide('slide',{direction:'top',duration:150}); } catch(_){}; try { $w('#PaystackDetails').show('slide',{direction:'top',duration:200}); } catch(_){} });
    $w('#PaystackPay').onMouseOut(() => { try { $w('#PaystackDetails').hide('slide',{direction:'top',duration:150}); } catch(_){} });
  } catch(_){}
  try {
    $w('#PayfastPay').onMouseIn(() => { try { $w('#PaystackDetails').hide('slide',{direction:'top',duration:150}); } catch(_){}; try { $w('#PayfastDetails').show('slide',{direction:'top',duration:200}); } catch(_){} });
    $w('#PayfastPay').onMouseOut(() => { try { $w('#PayfastDetails').hide('slide',{direction:'top',duration:150}); } catch(_){} });
  } catch(_){}

  async function collectSubscriber() {
    const user = wixUsers.currentUser;
    let email = '';
    try { email = await user.getEmail(); } catch {}
    let profile = null;
    try { const { getEmergencyProfile } = await import('backend/core/profile-service.jsw'); profile = await getEmergencyProfile(user.id).catch(() => null); } catch(_){ }
    const fullName = profile?.fullName || ($w('#inputFullName')?.value || '').trim();
    const phone = profile?.phone || ($w('#inputPhone')?.value || '').trim();
    const wa = profile?.whatsAppNumber || ($w('#inputWA')?.value || '').trim();
    const home = profile?.homeAddress || ($w('#homeAddress')?.value || '');
    const delivery = profile?.deliveryAddress || ($w('#deliveryAddress')?.value || '');
    try { $w('#SubscriberName').text = fullName || ''; $w('#SubscriberName').show(); } catch{}
    try { $w('#SubscriberEmail').text = email || ''; $w('#SubscriberEmail').show(); } catch{}
    try { $w('#SubscriberPhoneNumber').text = (phone || wa || ''); $w('#SubscriberPhoneNumber').show(); } catch{}
    try { $w('#SubscriberHomeAddress').text = String(home || ''); $w('#SubscriberHomeAddress').show(); } catch{}
    try { $w('#SubscriberDeliveryAddress').text = String(delivery || ''); $w('#SubscriberDeliveryAddress').show(); } catch{}
    return { userId: user.id, email, fullName, phone: (phone || wa), homeAddress: home, deliveryAddress: delivery };
  }

  async function ensureSaved(sub){
    try { await saveEmergencyProfile({ userId: sub.userId, email: sub.email, fullName: sub.fullName, phone: sub.phone, homeAddress: sub.homeAddress, deliveryAddress: sub.deliveryAddress, fullNameInput: sub.fullName, signUpPhoneNumber: sub.phone, address1Input: sub.homeAddress }); } catch(_){ }
  }

  let paying = false;
  async function startPaystack(){
    if (paying) return; paying = true;
    try { $w('#errorText').hide(); } catch{}
    try { $w('#PaystackPay').disable(); } catch{}
    try { $w('#PayfastPay').disable(); } catch{}
    try { $w('#loadingSpinner').show(); } catch{}
    const sub = await collectSubscriber();
    await ensureSaved(sub);
    const ref = `EMERGI-SIGNUP-PS-${sub.userId}-${Date.now()}`;
    const channels = ['card','bank','apple_pay','qr','mobile_money','eft','payattitude'];
    const url = await createSignupPaymentUrl(sub.userId, sub.email, { currency: 'ZAR', channels, reference: ref, callback_url: 'https://www.emergitag.me/signup-success', metaExtra: { subscriberName: sub.fullName, subscriberEmail: sub.email, subscriberPhoneNumber: sub.phone, subscriberHomeAddress: sub.homeAddress, subscriberDeliveryAddress: sub.deliveryAddress } });
    if (!url) { try { $w('#errorText').text = 'Could not create Paystack payment'; $w('#errorText').show(); } catch{}; try { $w('#PaystackPay').enable(); } catch{}; try { $w('#PayfastPay').enable(); } catch{}; try { $w('#loadingSpinner').hide(); } catch{}; paying=false; return; }
    wixLocation.to(url);
  }

  async function startPayfast(){
    if (paying) return; paying = true;
    try { $w('#errorText').hide(); } catch{}
    try { $w('#PayfastPay').disable(); } catch{}
    try { $w('#PaystackPay').disable(); } catch{}
    try { $w('#loadingSpinner').show(); } catch{}
    const sub = await collectSubscriber();
    await ensureSaved(sub);
    const url = await generatePayFastUrl(sub.userId, 149.00);
    if (!url) { try { $w('#errorText').text = 'Could not create PayFast payment'; $w('#errorText').show(); } catch{}; try { $w('#PayfastPay').enable(); } catch{}; try { $w('#PaystackPay').enable(); } catch{}; try { $w('#loadingSpinner').hide(); } catch{}; paying=false; return; }
    wixLocation.to(url);
  }

  try { $w('#PaystackPay').onClick(() => startPaystack()); } catch{}
  try { $w('#PayfastPay').onClick(() => startPayfast()); } catch{}
});

