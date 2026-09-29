import axios from "axios";

/**
 * Service to handle password recovery and update operations
 */
export const forgotPassword = async (email) => {
  try {
    const response = await axios.post("/password/forgotpassword", {
      email: email.trim()
    });
    return response.data;
  } catch (error) {
    const message = error.response?.data?.message || error.message || "Failed to send reset link.";
    throw new Error(message);
  }
};

export const updatePassword = async (id, password) => {
  try {
    const response = await axios.post(`/password/updatepassword/${id}`, {
      password
    });
    return response.data;
  } catch (error) {
    const message = error.response?.data?.message || error.message || "Failed to update password.";
    throw new Error(message);
  }
};

export default {
  forgotPassword,
  updatePassword
};
