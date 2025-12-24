// Environment variable handling with fallbacks for missing values
export const VITE_OAUTH_PORTAL_URL = import.meta.env.VITE_OAUTH_PORTAL_URL || '';
export const VITE_APP_ID = import.meta.env.VITE_APP_ID || '';

// Validation helper to check if required environment variables are set
export const validateEnvironmentVariables = (): boolean => {
  const missingVariables: string[] = [];
  
  if (!VITE_OAUTH_PORTAL_URL) {
    missingVariables.push('VITE_OAUTH_PORTAL_URL');
  }
  
  if (!VITE_APP_ID) {
    missingVariables.push('VITE_APP_ID');
  }
  
  if (missingVariables.length > 0) {
    console.warn(
      `Missing environment variables: ${missingVariables.join(', ')}. ` +
      'Please ensure these are defined in your .env file.'
    );
    return false;
  }
  
  return true;
};
