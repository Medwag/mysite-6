// pages/PaymentMethodSelector.js
// ✅ PRODUCTION READY: Payment Method Selection Lightbox
// Gives users choice between Paystack and PayFast for R149.00 signup

import { getPaymentMethods, createSignupPaymentWithGateway, getRecommendedPaymentMethod } from 'backend/core/dual-payment-gateway.jsw';
import wixUsers from 'wix-users';
import wixWindow from 'wix-window';
import wixLocation from 'wix-location';

let selectedGateway = null;
let paymentMethods = [];

let lightboxContext = {};

$w.onReady(async function () {
    console.log('💳 Payment Method Selector Ready');
    
    // Get context data passed to lightbox
    try {
        lightboxContext = wixWindow.lightbox.getContext() || {};
        console.log('Lightbox context:', lightboxContext);
    } catch (err) {
        console.log('No context data provided to lightbox');
        lightboxContext = {};
    }
    
    // 🛡️ Enhanced error handling to prevent blank display
    try {
        // Hide all elements initially with error handling
        hideAllElements();
    } catch (hideErr) {
        console.error('Error hiding elements:', hideErr);
        // Continue anyway - don't let this stop the process
    }
    
    // 🛡️ Check if essential UI elements exist
    const essentialElements = ['#loadingText', '#errorText'];
    const missingElements = [];
    
    essentialElements.forEach(elementId => {
        try {
            if (!$w(elementId)) {
                missingElements.push(elementId);
            }
        } catch (checkErr) {
            console.warn(`Element ${elementId} check failed:`, checkErr);
            missingElements.push(elementId);
        }
    });
    
    if (missingElements.length > 0) {
        console.error('Critical UI elements missing:', missingElements);
        // Show error via alert as fallback
        setTimeout(() => {
            alert('Payment interface error: Some required elements are missing. Please try refreshing the page or contact support.');
            wixWindow.lightbox.close({ error: true, message: 'Missing UI elements' });
        }, 1000);
        return;
    }
    
    // Show loading with fallback
    try {
        $w('#loadingText').text = '⏳ Loading payment options...';
        $w('#loadingText').show();
    } catch (loadingErr) {
        console.error('Error showing loading text:', loadingErr);
        // Try alternative loading display
        try {
            if ($w('#errorText')) {
                $w('#errorText').text = '⏳ Loading payment options...';
                $w('#errorText').show();
            }
        } catch (altErr) {
            console.error('All loading display methods failed:', altErr);
        }
    }
    
    // Get current user with enhanced validation
    const user = wixUsers.currentUser;
    if (!user || !user.loggedIn) {
        showError('Please log in to continue with payment.');
        return;
    }
    
    // Add timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
        console.error('⏰ Payment method loading timeout - forcing error display');
        showError('Payment options are taking too long to load. Please try again or contact support.');
    }, 15000); // 15 second timeout
    
    try {
        console.log('🔍 Loading payment methods...');
        
        // Load available payment methods with detailed logging
        paymentMethods = await getPaymentMethods(user.id);
        console.log('✅ Available payment methods loaded:', paymentMethods);
        
        // Clear timeout since loading succeeded
        clearTimeout(loadingTimeout);
        
        if (!paymentMethods || paymentMethods.length === 0) {
            showError('No payment methods available. Please contact support.');
            return;
        }
        
        // Get recommendation with fallback
        let recommendation = null;
        try {
            recommendation = await getRecommendedPaymentMethod(user.id);
            console.log('Payment recommendation:', recommendation);
        } catch (recErr) {
            console.warn('Could not get payment recommendation:', recErr);
            // Continue without recommendation
        }
        
        // Setup UI with comprehensive error handling
        console.log('🎨 Setting up payment method UI...');
        await setupPaymentMethodUI();
        
        // Hide loading
        try {
            $w('#loadingText').hide();
        } catch (hideLoadingErr) {
            console.warn('Could not hide loading text:', hideLoadingErr);
        }
        
        console.log('✅ Payment Method Selector initialization complete');
        
    } catch (error) {
        console.error('💥 Critical payment method loading error:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            userId: user?.id,
            context: lightboxContext
        });
        
        // Clear timeout
        clearTimeout(loadingTimeout);
        
        // Show detailed error for debugging
        const errorMessage = error.message || 'Unknown error occurred';
        showError(`Error loading payment options: ${errorMessage}. Please try refreshing or contact support.`);
    }
});

async function setupPaymentMethodUI() {
    // Show main container with error handling
    try {
        if ($w('#paymentContainer')) {
            $w('#paymentContainer').show();
        }
    } catch (err) {
        console.warn('PaymentContainer element not found:', err);
    }
    
    // Set header with error handling
    try {
        if ($w('#headerText')) {
            $w('#headerText').text = '💳 Choose Your Payment Method';
            $w('#headerText').show();
        }
    } catch (err) {
        console.warn('HeaderText element not found:', err);
    }
    
    // Set amount with error handling
    try {
        if ($w('#amountText')) {
            $w('#amountText').text = 'Signup Fee: R149.00';
            $w('#amountText').show();
        }
    } catch (err) {
        console.warn('AmountText element not found:', err);
    }
    
    // Setup payment method buttons with fallback
    try {
        if (paymentMethods.length === 1) {
            // Only one method available
            await setupSinglePaymentMethod();
        } else {
            // Multiple methods - show selection
            await setupMultiplePaymentMethods();
        }
    } catch (setupErr) {
        console.error('Error setting up payment methods:', setupErr);
        // Fallback to simple interface
        await setupFallbackInterface();
    }
    
    // Show continue button with error handling
    try {
        if ($w('#continueButton')) {
            $w('#continueButton').show();
            $w('#continueButton').onClick(() => handlePaymentSelection());
        }
    } catch (continueErr) {
        console.warn('Continue button setup failed:', continueErr);
    }
    
    // Show cancel button with error handling
    try {
        if ($w('#cancelButton')) {
            $w('#cancelButton').show();
            $w('#cancelButton').onClick(() => wixWindow.lightbox.close());
        }
    } catch (cancelErr) {
        console.warn('Cancel button setup failed:', cancelErr);
    }
}

async function setupSinglePaymentMethod() {
    const method = paymentMethods[0];
    selectedGateway = method.id;
    
    // Hide selection, show single method
    $w('#selectionText').text = `Payment will be processed via ${method.name}`;
    $w('#selectionText').show();
    
    // Show method details
    $w('#methodDetailsContainer').show();
    $w('#methodName').text = method.name;
    $w('#methodDescription').text = method.description;
    $w('#methodFeatures').text = `Supports: ${method.supported.join(', ')}`;
    
    // Update continue button
    $w('#continueButton').label = `Pay R149.00 via ${method.name}`;
}

async function setupMultiplePaymentMethods() {
    // Show selection text
    $w('#selectionText').text = 'Select your preferred payment method:';
    $w('#selectionText').show();
    
    // Setup Paystack button if available
    const paystackMethod = paymentMethods.find(m => m.id === 'paystack');
    if (paystackMethod) {
        $w('#paystackButton').show();
        $w('#paystackButton').label = `${paystackMethod.name} - ${paystackMethod.description}`;
        $w('#paystackButton').onClick(() => selectPaymentMethod('paystack', paystackMethod));
        
        // Show Paystack details
        $w('#paystackDetails').text = `✓ ${paystackMethod.processingTime} • ${paystackMethod.supported.join(', ')}`;
        $w('#paystackDetails').show();
    }
    
    // Setup PayFast button if available  
    const payfastMethod = paymentMethods.find(m => m.id === 'payfast');
    if (payfastMethod) {
        $w('#payfastButton').show();
        $w('#payfastButton').label = `${payfastMethod.name} - ${payfastMethod.description}`;
        $w('#payfastButton').onClick(() => selectPaymentMethod('payfast', payfastMethod));
        
        // Show PayFast details
        $w('#payfastDetails').text = `✓ ${payfastMethod.processingTime} • ${payfastMethod.supported.join(', ')}`;
        $w('#payfastDetails').show();
    }
    
    // Set default selection (Paystack if available)
    if (paystackMethod) {
        selectPaymentMethod('paystack', paystackMethod);
    } else if (payfastMethod) {
        selectPaymentMethod('payfast', payfastMethod);
    }
}

function selectPaymentMethod(gatewayId, method) {
    selectedGateway = gatewayId;
    
    // Update button styles
    $w('#paystackButton').style.backgroundColor = gatewayId === 'paystack' ? '#0084ff' : '#e0e0e0';
    $w('#payfastButton').style.backgroundColor = gatewayId === 'payfast' ? '#ff6b35' : '#e0e0e0';
    
    // Update continue button
    $w('#continueButton').label = `Pay R149.00 via ${method.name}`;
    $w('#continueButton').enable();
    
    // Show selected method details
    $w('#selectedMethodText').text = `Selected: ${method.name} - ${method.description}`;
    $w('#selectedMethodText').show();
}

async function handlePaymentSelection() {
    if (!selectedGateway) {
        showError('Please select a payment method.');
        return;
    }
    
    try {
        // Show processing
        $w('#continueButton').label = '⏳ Creating payment...';
        $w('#continueButton').disable();
        
        const user = wixUsers.currentUser;
        
        // Create payment with selected gateway
        const userId = lightboxContext.userId || user.id;
        const email = lightboxContext.email || user.email;
        
        console.log(`Creating payment with ${selectedGateway} for user ${userId}`);
        const paymentResult = await createSignupPaymentWithGateway(userId, selectedGateway, email);
        
        if (paymentResult.success) {
            console.log('✅ Payment created successfully:', paymentResult);
            
            // Show success message
            $w('#continueButton').label = '✅ Redirecting to payment...';
            
            // Close lightbox with success result
            wixWindow.lightbox.close({ 
                paymentInitiated: true, 
                gateway: selectedGateway,
                redirectUrl: paymentResult.redirectUrl 
            });
            
            // Redirect to payment gateway
            wixLocation.to(paymentResult.redirectUrl);
            
        } else {
            console.error('❌ Payment creation failed:', paymentResult);
            showError(`Payment creation failed: ${paymentResult.error}`);
            
            // Reset button
            $w('#continueButton').label = `Pay R149.00 via ${selectedGateway}`;
            $w('#continueButton').enable();
        }
        
    } catch (error) {
        console.error('Payment selection error:', error);
        showError(`Payment error: ${error.message}`);
        
        // Reset button
        $w('#continueButton').label = `Pay R149.00 via ${selectedGateway}`;
        $w('#continueButton').enable();
    }
}

async function setupFallbackInterface() {
    console.log('🚨 Setting up fallback payment interface');
    
    // Use basic text display as fallback
    try {
        if ($w('#loadingText')) {
            const methodNames = paymentMethods.map(m => m.name).join(' or ');
            $w('#loadingText').text = `💳 Payment Method: ${methodNames}\nSignup Fee: R149.00\n\nClick Continue to proceed with payment.`;
            $w('#loadingText').show();
        }
        
        // Default to first available payment method
        if (paymentMethods.length > 0) {
            selectedGateway = paymentMethods[0].id;
            console.log(`Fallback: Selected ${selectedGateway} as default payment method`);
        }
        
    } catch (fallbackErr) {
        console.error('Even fallback interface failed:', fallbackErr);
        showError('Payment interface could not be loaded. Please contact support.');
    }
}

function hideAllElements() {
    [
        '#paymentContainer',
        '#headerText',
        '#amountText',
        '#selectionText',
        '#paystackButton',
        '#payfastButton',
        '#paystackDetails',
        '#payfastDetails',
        '#methodDetailsContainer',
        '#selectedMethodText',
        '#continueButton',
        '#cancelButton',
        '#errorText'
    ].forEach(id => {
        try {
            $w(id).hide();
        } catch (e) {
            // Element doesn't exist
        }
    });
}

function showError(message) {
    console.error('Payment selector error:', message);
    
    // Hide all other elements
    hideAllElements();
    
    // Show error with fallback handling
    try {
        if ($w('#errorText')) {
            $w('#errorText').text = `❌ ${message}`;
            $w('#errorText').show();
        } else {
            // Try alternative error display
            if ($w('#loadingText')) {
                $w('#loadingText').text = `❌ ${message}`;
                $w('#loadingText').show();
            } else {
                // Last resort - use browser alert
                console.error('No error display element available, using alert');
                setTimeout(() => alert(`Payment Error: ${message}`), 100);
            }
        }
    } catch (errorDisplayErr) {
        console.error('Could not display error message:', errorDisplayErr);
        // Absolute fallback
        setTimeout(() => alert(`Payment Error: ${message}`), 100);
    }
    
    // Show cancel button with error handling
    try {
        if ($w('#cancelButton')) {
            $w('#cancelButton').show();
            $w('#cancelButton').label = 'Close';
            
            // Ensure cancel button works
            $w('#cancelButton').onClick(() => {
                console.log('User clicked cancel after error');
                wixWindow.lightbox.close({ error: true, message });
            });
        } else {
            // If no cancel button, auto-close after 5 seconds
            console.warn('No cancel button available, auto-closing in 5 seconds');
            setTimeout(() => {
                wixWindow.lightbox.close({ error: true, message });
            }, 5000);
        }
    } catch (cancelErr) {
        console.error('Could not setup cancel button:', cancelErr);
        // Auto-close if no cancel button can be shown
        setTimeout(() => {
            wixWindow.lightbox.close({ error: true, message });
        }, 3000);
    }
}

// Export functions for external use
export function selectPaystack() {
    const paystackMethod = paymentMethods.find(m => m.id === 'paystack');
    if (paystackMethod) {
        selectPaymentMethod('paystack', paystackMethod);
    }
}

export function selectPayfast() {
    const payfastMethod = paymentMethods.find(m => m.id === 'payfast');
    if (payfastMethod) {
        selectPaymentMethod('payfast', payfastMethod);
    }
}