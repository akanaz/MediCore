import axios from "axios";

const RAW_API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const API_BASE_URL = RAW_API_BASE_URL.replace(/\/+$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
  withCredentials: false,
});

// Attach auth token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("medicore_token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("medicore_token");
      localStorage.removeItem("medicore_user");
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// ==================== AUTH APIs ====================

export const signup = async (email, password, name) => {
  try {
    const response = await api.post("/api/auth/signup", { email, password, name });
    if (response.data.access_token) {
      localStorage.setItem("medicore_token", response.data.access_token);
    }
    if (response.data.user) {
      localStorage.setItem("medicore_user", JSON.stringify(response.data.user));
    }
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.detail || error.message || "Signup failed";
    throw new Error(errorMessage);
  }
};

export const login = async (email, password) => {
  try {
    const response = await api.post("/api/auth/login", { email, password });
    if (response.data.access_token) {
      localStorage.setItem("medicore_token", response.data.access_token);
    }
    if (response.data.user) {
      localStorage.setItem("medicore_user", JSON.stringify(response.data.user));
    }
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.detail || error.message || "Login failed";
    throw new Error(errorMessage);
  }
};

export const logout = async () => {
  try {
    await api.post("/api/auth/logout");
  } catch {
    // Ignore logout errors
  } finally {
    localStorage.removeItem("medicore_token");
    localStorage.removeItem("medicore_user");
  }
};

// ==================== CHAT APIs ====================

export const createNewChat = async () => {
  try {
    const response = await api.post("/api/chat/new");
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to create chat");
  }
};

export const getChatHistory = async () => {
  try {
    const response = await api.get("/api/chat/history");
    return response.data.chats;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to get chat history");
  }
};

export const getChatDetail = async (chatId) => {
  try {
    const response = await api.get(`/api/chat/${chatId}`);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to get chat detail");
  }
};

export const deleteChat = async (chatId) => {
  try {
    const response = await api.delete(`/api/chat/${chatId}`);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to delete chat");
  }
};

export const sendMessage = async (message, chatId = null, awaitingFollowup = false) => {
  try {
    const response = await api.post("/api/chat", {
      message,
      chat_id: chatId,
      awaiting_followup: awaitingFollowup,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to send message");
  }
};

export const sendMessageStream = async (message, chatId = null, awaitingFollowup = false, onChunk) => {
  const token = localStorage.getItem("medicore_token");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message,
      chat_id: chatId,
      awaiting_followup: awaitingFollowup,
    }),
  });

  if (!response.ok) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result = { chat_id: null, awaiting_followup: false, sources: null, triage: null, confidence: null };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chat_id") {
            result.chat_id = data.chat_id;
          } else if (data.type === "content") {
            onChunk(data.content);
          } else if (data.type === "triage") {
            result.triage = data.triage;
            result.confidence = data.confidence;
          } else if (data.type === "done") {
            result.awaiting_followup = data.awaiting_followup;
            result.sources = data.sources || null;
          } else if (data.type === "error") {
            throw new Error(data.message);
          }
        } catch (e) {
          if (e.message !== "error") console.warn("SSE parse error:", e);
        }
      }
    }
  }

  return result;
};

export const sendImageMessage = async (file, message, chatId = null) => {
  try {
    const formData = new FormData();
    formData.append("image", file);
    formData.append("message", message || "Please analyze this medical image.");
    if (chatId) formData.append("chat_id", chatId);

    const token = localStorage.getItem("medicore_token");
    const response = await axios.post(`${API_BASE_URL}/api/chat/image`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 120000,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Image analysis failed");
  }
};

export const sendLabResults = async (file, context = "", chatId = null) => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("context", context || "");
    if (chatId) formData.append("chat_id", chatId);

    const token = localStorage.getItem("medicore_token");
    const response = await axios.post(`${API_BASE_URL}/api/chat/lab-results`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      timeout: 120000,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Lab result interpretation failed");
  }
};

export const simplifyConversation = async (chatHistory) => {
  try {
    const response = await api.post("/api/simplify", { chat_history: chatHistory });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Simplification failed");
  }
};

export const translateText = async (text, targetLanguage, sourceLanguage = "auto") => {
  try {
    const response = await api.post("/api/translate", {
      text,
      target_language: targetLanguage,
      source_language: sourceLanguage,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Translation failed");
  }
};

export const detectLanguage = async (text) => {
  try {
    const response = await api.post("/api/detect-language", { text });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Language detection failed");
  }
};

// ==================== HEALTH PROFILE APIs ====================

export const getHealthProfile = async () => {
  try {
    const response = await api.get("/api/profile");
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to get profile");
  }
};

export const updateHealthProfile = async (profileData) => {
  try {
    const response = await api.post("/api/profile", profileData);
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to update profile");
  }
};

export const deleteHealthProfile = async () => {
  try {
    const response = await api.delete("/api/profile");
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to delete profile");
  }
};

// ==================== FEEDBACK API ====================

export const submitFeedback = async (chatId, messageIndex, rating, comment = null) => {
  try {
    const response = await api.post("/api/feedback", {
      chat_id: chatId,
      message_index: messageIndex,
      rating,
      comment,
    });
    return response.data;
  } catch (error) {
    throw new Error(error.response?.data?.detail || error.message || "Failed to submit feedback");
  }
};

// ==================== HEALTH CHECK ====================

export const healthCheck = async () => {
  try {
    const response = await api.get("/health");
    return response.data;
  } catch (error) {
    throw error;
  }
};

export default api;
