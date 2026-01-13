/**
 * Retries an asynchronous operation with exponential backoff.
 * @param {Function} operation - The async function to retry.
 * @param {number} maxRetries - Maximum number of retries (default: 5).
 * @param {number} initialDelay - Initial delay in ms (default: 1000).
 * @returns {Promise<any>} - The result of the operation.
 */
export async function retryOperation(
  operation,
  maxRetries = 5,
  initialDelay = 1000
) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Analyze error to see if it's retryable
      const isRateLimit =
        error?.info?.response?.status === 429 ||
        error?.message?.includes("Too Many Requests") ||
        error?.code === "BAD_DATA" || // Ethers wraps batch errors in BAD_DATA
        (error?.value &&
          Array.isArray(error.value) &&
          error.value.some((e) => e.code === -32005));

      const isNetworkError =
        error?.code === "NETWORK_ERROR" ||
        error?.code === "TIMEOUT" ||
        error?.code === "SERVER_ERROR";

      if (isRateLimit || isNetworkError) {
        const delay = initialDelay * Math.pow(2, i);
        console.warn(
          `[RetryService] Operation failed (retry ${
            i + 1
          }/${maxRetries}). Waiting ${delay}ms. Error: ${
            error.shortMessage || error.message
          }`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // If not retryable, throw immediately
      throw error;
    }
  }
  throw lastError;
}
