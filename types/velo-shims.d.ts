// Ambient declarations so the TS server in the IDE can resolve Velo web modules

// Generic catch-all for any backend web module (JSW)
declare module 'backend/*' {
  const mod: any;
  export = mod;
}

// Specific typing for logger to get nicer intellisense
declare module 'backend/logger.jsw' {
  export function sendDiscordLog(message: string): Promise<any>;
}

// Status aggregator
declare module 'backend/status.jsw' {
  export interface PaymentStatus {
    hasSignUpPaid: boolean;
    hasSubscription: boolean;
    hasMembershipTierSelected: boolean;
    signupSource?: string | null;
    signupDate?: string | Date | null;
    signupAmount?: number | null;
    subscriptionSource?: string | null;
    membershipTier?: string | null;
    error?: string;
  }
  export function getUserPaymentStatus(userId: string, email?: string): Promise<PaymentStatus>;
}

// Payment service (web module wrappers)
declare module 'backend/core/payment-service.jsw' {
  export type Provider = 'paystack' | 'payfast' | string;
  export interface DetectSignupResult {
    success: boolean;
    paymentDetected?: boolean;
    provider?: Provider;
    amount?: number;
    reference?: string;
    confidence?: number;
    paymentDate?: string | Date | null;
    source?: string;
    error?: string;
  }
  export interface ActiveSubscriptionResult {
    success: boolean;
    hasActiveSubscription?: boolean;
    subscriptionCode?: string;
    planName?: string;
    status?: string;
    nextPaymentDate?: Date;
    confidence?: number;
    error?: string;
  }
  export function detectSignupPayment(userId: string, email: string, reference?: string | null, provider?: Provider | null): Promise<DetectSignupResult>;
  export function detectActiveSubscription(userId: string, email: string): Promise<ActiveSubscriptionResult>;
}

// Profile utils (subset used)
declare module 'backend/core/profile-service.jsw' {
  export function getEmergencyProfile(userId: string): Promise<any>;
  export function updateEmergencyProfile(userId: string, updates: any): Promise<any>;
}

declare module 'backend/profile-utils.jsw' {
  export function updateProfileByUserId(userId: string, updates: any): Promise<any>;
  export function sendPostPaymentNotifications(userId: string, paymentReference?: string | null): Promise<any>;
}

// Paystack web module
declare module 'backend/paystack.jsw' {
  export function createPaystackPayment(userId: string, email: string): Promise<string>;
  export function verifyPaystackRef(reference: string): Promise<any>;
  export function getUserSubscriptionDetails(userId: string): Promise<{
    status: string;
    planName: string | null;
    subscription_code?: string | null;
    email?: string | null;
    nextPaymentDate?: Date | null;
    error?: string;
  }>;
}

// PayFast web module
declare module 'backend/payfast.jsw' {
  export function testPayfastConnection(): Promise<any>;
  export function createPayfastPayment(userId: string, email: string): Promise<string>;
  export function finalizePayFastPayment(reference: string): Promise<{ ok: boolean; userId?: string; amount?: number; reference?: string; [k: string]: any }>;
}

// PayFast config
declare module 'backend/payfast-config.jsw' {
  export function getPayFastConfig(): Promise<any>;
  export function getPayFastPaymentUrl(): Promise<string>;
  export function getPayFastCredentials(): Promise<{ merchantId: number; merchantKey: string; passphrase?: string }>;
  export function isPayFastSandbox(): Promise<boolean>;
}

// Paystack config
declare module 'backend/paystack-config.jsw' {
  export const PAYSTACK_CONFIG: { API_BASE_URL: string };
  export function getPaystackSecretKey(): Promise<string>;
}
