// DIAGNOSTIC VERSION - Replace your Sign-up.bixme.js temporarily with this
// This version ONLY focuses on finding elements - no payment logic

import wixLocation from 'wix-location';
import wixUsers from 'wix-users';

$w.onReady(async function () {
    console.log("🔍 DIAGNOSTIC MODE - ELEMENT DISCOVERY ONLY");
    
    // Create a visible status area
    try {
        // Try to find ANY text element to show results
        const statusElements = $w('*').filter(el => {
            try {
                return el.type === 'text' || el.tagName === 'text' || (el.text !== undefined);
            } catch (e) {
                return false;
            }
        });
        
        if (statusElements.length > 0) {
            statusElements[0].text = "🔍 RUNNING ELEMENT DIAGNOSTIC...";
        }
    } catch (e) {
        console.log("Could not set status text");
    }
    
    // COMPREHENSIVE ELEMENT DISCOVERY
    setTimeout(() => {
        try {
            console.log("=".repeat(50));
            console.log("📊 COMPLETE ELEMENT INVENTORY");
            console.log("=".repeat(50));
            
            const allElements = $w('*');
            console.log(`Total elements on page: ${allElements.length}`);
            
            // Group elements by type
            const elementsByType = {};
            const elementsWithIds = [];
            
            allElements.forEach((el, index) => {
                try {
                    // Track by type
                    const type = el.type || el.tagName || 'unknown';
                    if (!elementsByType[type]) elementsByType[type] = 0;
                    elementsByType[type]++;
                    
                    // Track elements with IDs
                    if (el.id && el.id.trim().length > 0) {
                        elementsWithIds.push({
                            index: index,
                            id: el.id,
                            type: type,
                            element: el
                        });
                    }
                } catch (e) {
                    console.log(`Error processing element ${index}: ${e.message}`);
                }
            });
            
            // Log element type summary
            console.log("\n📋 ELEMENT TYPES:");
            Object.keys(elementsByType).forEach(type => {
                console.log(`   ${type}: ${elementsByType[type]} elements`);
            });
            
            // Log ALL elements with IDs
            console.log(`\n🆔 ALL ELEMENTS WITH IDs (${elementsWithIds.length} total):`);
            elementsWithIds.forEach(item => {
                console.log(`   ${item.index}. "${item.id}" (${item.type})`);
                
                // Test if this element is clickable
                try {
                    if (item.element.onClick && typeof item.element.onClick === 'function') {
                        console.log(`      ✅ Clickable (has onClick)`);
                    }
                } catch (e) {
                    // Not clickable
                }
                
                // Test common properties
                try {
                    if (item.element.show && typeof item.element.show === 'function') {
                        console.log(`      👁️ Showable (has show/hide)`);
                    }
                } catch (e) {
                    // No show/hide
                }
            });
            
            // SPECIFIC SEARCH for your elements
            console.log("\n🎯 SEARCHING FOR YOUR SPECIFIC ELEMENTS:");
            const searchTerms = [
                'paystack', 'payfast', 'signup', 'sign', 'dashboard', 'dash', 
                'subscription', 'sub', 'button', 'btn', 'container', 'status', 
                'text', 'form', 'box61', 'formContainer01'
            ];
            
            searchTerms.forEach(term => {
                const matches = elementsWithIds.filter(item => 
                    item.id.toLowerCase().includes(term.toLowerCase())
                );
                
                if (matches.length > 0) {
                    console.log(`\n"${term}" matches (${matches.length}):`);
                    matches.forEach(match => {
                        console.log(`   - "${match.id}" (${match.type})`);
                        
                        // Try to access this element directly
                        try {
                            const testEl = $w(`#${match.id}`);
                            if (testEl && testEl.length > 0) {
                                console.log(`     ✅ Accessible via #${match.id}`);
                            } else {
                                console.log(`     ❌ Not accessible via #${match.id}`);
                            }
                        } catch (e) {
                            console.log(`     💥 Error accessing #${match.id}: ${e.message}`);
                        }
                    });
                }
            });
            
            // Update status if possible
            try {
                const statusElements = $w('*').filter(el => {
                    try {
                        return el.type === 'text' || el.tagName === 'text' || (el.text !== undefined);
                    } catch (e) {
                        return false;
                    }
                });
                
                if (statusElements.length > 0) {
                    statusElements[0].text = `✅ DIAGNOSTIC COMPLETE - Found ${elementsWithIds.length} elements with IDs. Check browser console for full report.`;
                }
            } catch (e) {
                console.log("Could not update status text");
            }
            
        } catch (error) {
            console.error("❌ Diagnostic failed:", error);
        }
    }, 1000); // Wait 1 second for page to fully load
    
});