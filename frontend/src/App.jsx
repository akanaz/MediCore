import React, { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import ChatMessage from "./components/ChatMessage";
import ChatInput from "./components/ChatInput";
import LoadingSpinner from "./components/LoadingSpinner";
import LanguageSelector from "./components/LanguageSelector";
import VoiceControls from "./components/VoiceControls";
import AuthScreen from "./components/AuthScreen";
import Sidebar from "./components/Sidebar";
import HealthProfileForm from "./components/HealthProfileForm";
import ExportChatPDF from "./components/ExportChatPDF";
import SymptomChecker from "./components/SymptomChecker";
import LabUploadModal from "./components/LabUploadModal";
import InteractiveBodyMap from "./components/InteractiveBodyMap";
import {
  sendMessage,
  sendMessageStream,
  sendImageMessage,
  sendLabResults,
  simplifyConversation,
  translateText,
  detectLanguage,
  getChatHistory,
  getChatDetail,
  createNewChat,
  deleteChat as deleteC,
  logout as logoutApi,
} from "./services/api";
import "./styles/App.css";
import "./styles/AuthScreen.css";
import "./styles/Sidebar.css";

function App() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(() => localStorage.getItem("medicore_theme") || "dark");
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [awaitingFollowup, setAwaitingFollowup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSimplifyFor, setShowSimplifyFor] = useState(null);
  const [simplifying, setSimplifying] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("en");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showHealthProfile, setShowHealthProfile] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [showSymptomChecker, setShowSymptomChecker] = useState(false);
  const [selectedLabFile, setSelectedLabFile] = useState(null);
  const [labFilePreview, setLabFilePreview] = useState(null);
  const [showLabModal, setShowLabModal] = useState(false);
  const [showBodyMap, setShowBodyMap] = useState(false);
  const chatEndRef = useRef(null);
  const imageInputRef = useRef(null);
  const labFileInputRef = useRef(null);

  // Apply theme attribute to <html> whenever theme changes
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("medicore_theme", theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  useEffect(() => {
    const savedUser = localStorage.getItem("medicore_user");
    const token = localStorage.getItem("medicore_token");
    if (savedUser && token) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadConversations();
    }
  }, [user]);

  useEffect(() => {
    if (currentChatId) {
      loadChatMessages(currentChatId);
    }
  }, [currentChatId]);

  const loadConversations = async () => {
    try {
      const chats = await getChatHistory();
      setConversations(
        chats.map((chat) => ({
          id: chat.chat_id,
          title: chat.title,
          timestamp: chat.created_at,
          messageCount: chat.message_count,
        }))
      );
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  };

  const loadChatMessages = async (chatId) => {
    try {
      const chatDetail = await getChatDetail(chatId);
      setMessages(
        chatDetail.messages.map((msg, idx) => {
          const isImageMsg = msg.role === "user" && msg.content.startsWith("[Image uploaded]");
          return {
            ...msg,
            content: isImageMsg ? msg.content.replace("[Image uploaded] ", "") : msg.content,
            id: `${chatId}-${idx}`,
            formatted: msg.role === "assistant" ? formatMedicalResponse(msg.content) : null,
            hadImage: isImageMsg,
          };
        })
      );
    } catch (error) {
      console.error("Failed to load chat messages:", error);
      setMessages([]);
    }
  };

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await logoutApi();
    } catch (error) {
      console.error("Logout error:", error);
    }
    setUser(null);
    setConversations([]);
    setMessages([]);
    setCurrentChatId(null);
    setAwaitingFollowup(false);
  };

  const newConversation = async () => {
    try {
      const response = await createNewChat();
      setCurrentChatId(response.chat_id);
      setMessages([]);
      setAwaitingFollowup(false);
      await loadConversations();
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  const selectConversation = (chatId) => {
    setCurrentChatId(chatId);
    setAwaitingFollowup(false);
  };

  const handleDeleteChat = async (chatId) => {
    try {
      await deleteC(chatId);
      if (currentChatId === chatId) {
        setCurrentChatId(null);
        setMessages([]);
      }
      await loadConversations();
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  const formatMedicalResponse = (responseText) => {
    const sections = {
      // Old format (backwards compatible)
      "**Overview**": { icon: "📋" },
      "**Possible Causes**": { icon: "🔍" },
      "**Common Symptoms**": { icon: "⚠️" },
      "**Recommended Actions**": { icon: "✅" },
      "**When to Seek Medical Care**": { icon: "🏥" },
      "**Medical Disclaimer**": { icon: "⚖️" },
      // New adaptive format - Symptom queries
      "**Understanding Your Concern**": { icon: "💭" },
      "**What This Could Indicate**": { icon: "🔍" },
      "**Key Symptoms to Monitor**": { icon: "⚠️" },
      "**Recommended Steps**": { icon: "✅" },
      "**Seek Medical Attention If**": { icon: "🚨" },
      // New adaptive format - Condition queries
      "**Causes and Risk Factors**": { icon: "🔍" },
      "**Signs and Symptoms**": { icon: "⚠️" },
      "**Management and Treatment**": { icon: "💊" },
      "**Living With This Condition**": { icon: "🌱" },
      // New adaptive format - Medication queries
      "**Medication Overview**": { icon: "💊" },
      "**Common Uses**": { icon: "📋" },
      "**Important Safety Information**": { icon: "⚠️" },
      "**Usage Guidance**": { icon: "📝" },
    };

    let formatted = [];
    const lines = responseText.split("\n");
    let currentSection = null;
    let currentContent = [];

    lines.forEach((line) => {
      const lineTrimmed = line.trim();
      for (const [header, meta] of Object.entries(sections)) {
        if (lineTrimmed.includes(header)) {
          if (currentSection && currentContent.length > 0) {
            formatted.push({
              type: "section",
              header: currentSection.header,
              icon: currentSection.icon,
              content: currentContent.filter((c) => c.trim()),
            });
          }
          currentSection = { header, icon: meta.icon };
          currentContent = [];
          return;
        }
      }
      if (lineTrimmed && currentSection) {
        currentContent.push(lineTrimmed);
      }
    });

    if (currentSection && currentContent.length > 0) {
      formatted.push({
        type: "section",
        header: currentSection.header,
        icon: currentSection.icon,
        content: currentContent.filter((c) => c.trim()),
      });
    }

    return formatted.length > 0 ? formatted : null;
  };

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (message) => {
    const originalMessage = message;
    let processedMessage = message;
    let detectedLang = "en";

    if (selectedLanguage !== "en") {
      try {
        const detectionResult = await detectLanguage(message);
        detectedLang = detectionResult.language;
      } catch {
        // Language detection failed; proceed with original message
      }
    }

    if (detectedLang !== "en") {
      try {
        const translationResult = await translateText(message, "en", detectedLang);
        processedMessage = translationResult.translated_text;
      } catch {
        // Translation failed; proceed with original message
      }
    }

    const newUserMessage = {
      role: "user",
      content: originalMessage,
      id: Date.now() + "-user",
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const assistantId = Date.now();
      let streamedContent = "";

      // Add a placeholder assistant message for streaming
      const placeholderMessage = {
        role: "assistant",
        content: "",
        id: assistantId,
        isFollowup: false,
        formatted: "",
        sources: null,
        confidence: null,
        triage: null,
        isStreaming: true,
      };
      setMessages([...updatedMessages, placeholderMessage]);

      const result = await sendMessageStream(
        processedMessage,
        currentChatId,
        awaitingFollowup,
        (chunk) => {
          streamedContent += chunk;
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.id === assistantId) {
              updated[lastIdx] = {
                ...updated[lastIdx],
                content: streamedContent,
                formatted: formatMedicalResponse(streamedContent),
              };
            }
            return updated;
          });
        }
      );

      // Translate the full response if needed
      let finalContent = streamedContent;
      if (selectedLanguage !== "en") {
        try {
          const translationResult = await translateText(streamedContent, selectedLanguage, "en");
          finalContent = translationResult.translated_text;
        } catch (error) {
          console.warn("Translation back failed:", error);
        }
      }

      // Finalize the assistant message with metadata
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.id === assistantId) {
          updated[lastIdx] = {
            ...updated[lastIdx],
            content: finalContent,
            formatted: formatMedicalResponse(finalContent),
            isFollowup: result.awaiting_followup,
            sources: result.sources || null,
            confidence: result.confidence || null,
            triage: result.triage || null,
            isStreaming: false,
          };
        }
        return updated;
      });

      setCurrentChatId(result.chat_id);
      setAwaitingFollowup(result.awaiting_followup);

      if (!result.awaiting_followup) {
        setShowSimplifyFor(assistantId);
      }

      await loadConversations();
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = {
        role: "assistant",
        content: "⚠️ Sorry, there was an error. Please try again.",
        id: Date.now(),
        isError: true,
      };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      alert(t("chat.imageFormat"));
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      alert(t("chat.imageSize"));
      return;
    }

    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = () => {
    setSelectedImage(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handleSendWithImage = async (message) => {
    if (!selectedImage) {
      handleSendMessage(message);
      return;
    }

    const file = selectedImage;
    clearImage();

    // Convert to data URL so it persists in chat history
    const imageDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });

    const newUserMessage = {
      role: "user",
      content: message || "Analyze this image",
      id: Date.now() + "-user",
      imageUrl: imageDataUrl,
    };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      const result = await sendImageMessage(file, message, currentChatId);

      const formatted = formatMedicalResponse(result.response);
      const assistantMessage = {
        role: "assistant",
        content: result.response,
        formatted,
        id: Date.now(),
      };

      setMessages([...updatedMessages, assistantMessage]);
      setCurrentChatId(result.chat_id);
      setAwaitingFollowup(false);
      await loadConversations();
    } catch (error) {
      console.error("Image analysis error:", error);
      const errorMessage = {
        role: "assistant",
        content: `⚠️ Image analysis failed: ${error.message}`,
        id: Date.now(),
        isError: true,
      };
      setMessages([...updatedMessages, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleSimplify = async (messageId) => {
    setSimplifying(true);
    try {
      const index = messages.findIndex((msg) => msg.id === messageId);
      const messagesToSimplify = index >= 0 ? messages.slice(0, index + 1) : messages;

      let textToSimplify = "";
      for (let i = messagesToSimplify.length - 1; i >= 0; i--) {
        if (messagesToSimplify[i].role === "assistant") {
          textToSimplify = messagesToSimplify[i].content;
          break;
        }
      }

      let processedText = textToSimplify;
      if (selectedLanguage !== "en") {
        try {
          const translationResult = await translateText(textToSimplify, "en", selectedLanguage);
          processedText = translationResult.translated_text;
        } catch (error) {
          console.warn("Translation failed:", error);
        }
      }

      const simplifiedHistory = [{ role: "assistant", content: processedText }];
      const response = await simplifyConversation(simplifiedHistory);
      let simplifiedText = response.simplified;

      if (selectedLanguage !== "en") {
        try {
          const translationResult = await translateText(simplifiedText, selectedLanguage, "en");
          simplifiedText = translationResult.translated_text;
        } catch (error) {
          console.warn("Translation back failed:", error);
        }
      }

      const simplifiedMessage = {
        role: "assistant",
        content: `🧩 **Simplified:**\n\n${simplifiedText}`,
        id: Date.now(),
        isSimplified: true,
      };

      setMessages([...messages, simplifiedMessage]);
      setShowSimplifyFor(null);
    } catch (error) {
      console.error("Simplification error:", error);
    } finally {
      setSimplifying(false);
    }
  };

  const handleExampleClick = (text) => {
    if (!loading) {
      handleSendMessage(text);
    }
  };

  const handleBodyMapConsult = (message) => {
    setShowBodyMap(false);
    handleSendMessage(message);
  };

  const handleLabFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      alert(t("chat.labFormat"));
      if (labFileInputRef.current) labFileInputRef.current.value = "";
      return;
    }
    const maxSize = file.type === "application/pdf" ? 10 * 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(t("chat.fileTooLarge", { size: file.type === "application/pdf" ? "10" : "4" }));
      if (labFileInputRef.current) labFileInputRef.current.value = "";
      return;
    }
    setSelectedLabFile(file);
    setLabFilePreview(file.name);
    setShowLabModal(true);
  };

  const handleSendLabResults = async (contextText) => {
    if (!selectedLabFile) return;
    const file = selectedLabFile;
    setSelectedLabFile(null);
    setLabFilePreview(null);
    setShowLabModal(false);
    if (labFileInputRef.current) labFileInputRef.current.value = "";
    setLoading(true);
    try {
      const result = await sendLabResults(file, contextText, currentChatId);
      setCurrentChatId(result.chat_id);
      const userMsg = {
        role: "user",
        content: contextText || "Lab results uploaded for interpretation",
        id: Date.now() - 1,
        isLabUpload: true,
        labFileName: file.name,
      };
      const assistantMsg = {
        role: "assistant",
        content: result.interpretation,
        id: Date.now(),
        isLabResult: true,
        labValues: result.lab_values || [],
        sources: result.sources,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      await loadConversations();
    } catch (error) {
      console.error("Lab results error:", error);
      const errMsg = {
        role: "assistant",
        content: `Sorry, I couldn't process the lab report: ${error.message}`,
        id: Date.now(),
      };
      setMessages((prev) => [
        ...prev,
        { role: "user", content: contextText || "Lab report", id: Date.now() - 1 },
        errMsg,
      ]);
    } finally {
      setLoading(false);
    }
  };

  const getHospitalSearchTerm = (text) => {
    const lower = text.toLowerCase();
    // Map keywords to the specialist/department to search for
    const specialtyMap = [
      { keywords: ["skin", "rash", "dermat", "eczema", "acne", "psoriasis", "fungal", "dandruff", "scalp", "seborrheic"], specialty: "dermatologist" },
      { keywords: ["heart", "chest pain", "cardiac", "blood pressure", "hypertension", "cardiovascular"], specialty: "cardiologist" },
      { keywords: ["bone", "fracture", "joint", "orthop", "spine", "back pain", "arthritis", "knee", "shoulder"], specialty: "orthopedic hospital" },
      { keywords: ["eye", "vision", "ophthal", "cataract", "glaucoma"], specialty: "eye hospital" },
      { keywords: ["ear", "nose", "throat", "ent", "sinus", "tonsil", "hearing"], specialty: "ENT hospital" },
      { keywords: ["tooth", "dental", "gum", "oral"], specialty: "dental clinic" },
      { keywords: ["brain", "neuro", "headache", "migraine", "seizure", "nerve"], specialty: "neurologist" },
      { keywords: ["stomach", "digest", "gastro", "abdomen", "liver", "bowel", "nausea", "vomit"], specialty: "gastroenterologist" },
      { keywords: ["lung", "breath", "asthma", "pulmon", "cough", "respiratory", "bronch", "pneumon", "copd", "tuberculosis", "tb "], specialty: "pulmonologist" },
      { keywords: ["kidney", "urin", "bladder", "nephro", "renal"], specialty: "nephrologist" },
      { keywords: ["diabetes", "thyroid", "hormone", "endocrin", "insulin"], specialty: "endocrinologist" },
      { keywords: ["cancer", "tumor", "oncol", "malignant", "chemotherapy", "carcinoma"], specialty: "oncologist" },
      { keywords: ["child", "pediatr", "infant", "baby", "newborn"], specialty: "pediatrician" },
      { keywords: ["pregnan", "gynec", "obstet", "menstr", "ovary", "uterus", "pcos"], specialty: "gynecologist" },
      { keywords: ["mental", "depress", "anxiety", "psychiatr", "psychol", "bipolar", "schizo"], specialty: "psychiatrist" },
      { keywords: ["allerg", "immune", "autoimmune", "immunol"], specialty: "allergist" },
      { keywords: ["swollen", "swelling", "lymphaden", "neck lump"], specialty: "general surgeon" },
    ];

    // Count total keyword occurrences for each specialty instead of first-match
    let bestSpecialty = null;
    let bestCount = 0;

    for (const { keywords, specialty } of specialtyMap) {
      let count = 0;
      for (const kw of keywords) {
        // Count how many times this keyword appears in the text
        let idx = 0;
        while ((idx = lower.indexOf(kw, idx)) !== -1) {
          count++;
          idx += kw.length;
        }
      }
      if (count > bestCount) {
        bestCount = count;
        bestSpecialty = specialty;
      }
    }

    return bestSpecialty ? `${bestSpecialty} near me` : "hospital near me";
  };

  const handleFindHospitals = (query) => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }

    const searchTerm = getHospitalSearchTerm(query);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const encodedSearch = encodeURIComponent(searchTerm);
        window.open(
          `https://www.google.com/maps/search/${encodedSearch}/@${latitude},${longitude},14z`,
          "_blank"
        );
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            alert(t("chat.locationDenied"));
            break;
          case error.POSITION_UNAVAILABLE:
            alert(t("chat.locationUnavailable"));
            break;
          case error.TIMEOUT:
            alert(t("chat.locationTimeout"));
            break;
          default:
            alert(t("chat.locationError"));
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  };

  if (!user) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        conversations={conversations}
        currentConvId={currentChatId}
        onSelectConversation={selectConversation}
        onNewConversation={newConversation}
        onDeleteChat={handleDeleteChat}
        user={user}
        onLogout={handleLogout}
      />

      <main className="main-area">
        <header className="top-header">
          <button className="menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label={t("header.toggleSidebar")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <div className="header-title">
            <span className="title-icon">🏥</span>
            <span>{t("header.title")}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={t("header.toggleTheme")}
              title={theme === 'dark' ? t("header.lightMode") : t("header.darkMode")}
            >
              {theme === 'dark' ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/>
                  <line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            <button
              className="profile-btn"
              onClick={() => setShowHealthProfile(true)}
              aria-label={t("header.openProfile")}
              title={t("profile.title")}
            >
              <span>👤</span>
              <span>{t("header.profile")}</span>
            </button>
            <ExportChatPDF messages={messages} chatId={currentChatId} />
            <LanguageSelector selectedLanguage={selectedLanguage} onLanguageChange={setSelectedLanguage} />
          </div>
        </header>

        <div className="chat-area">
          {messages.length === 0 ? (
            <div className="welcome-container">
              <div className="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
              </div>
              <h1>{t("welcome.title")}</h1>
              <p>{t("welcome.subtitle")}</p>

              <div className="feature-cards">
                <div className="feature-card" role="button" tabIndex={0} onClick={() => handleExampleClick(t("welcome.chestPainMsg"))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExampleClick(t("welcome.chestPainMsg")); } }} aria-label={t("welcome.chestPainDesc")}>
                  <div className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                      <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                  </div>
                  <div className="card-content">
                    <h3>{t("welcome.chestPain")}</h3>
                    <p>{t("welcome.chestPainDesc")}</p>
                  </div>
                </div>

                <div className="feature-card" role="button" tabIndex={0} onClick={() => handleExampleClick(t("welcome.headacheMsg"))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExampleClick(t("welcome.headacheMsg")); } }} aria-label={t("welcome.headacheDesc")}>
                  <div className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"></circle>
                      <path d="M12 16v-4"></path>
                      <path d="M12 8h.01"></path>
                    </svg>
                  </div>
                  <div className="card-content">
                    <h3>{t("welcome.headache")}</h3>
                    <p>{t("welcome.headacheDesc")}</p>
                  </div>
                </div>

                <div className="feature-card" role="button" tabIndex={0} onClick={() => handleExampleClick(t("welcome.feverMsg"))} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleExampleClick(t("welcome.feverMsg")); } }} aria-label={t("welcome.feverDesc")}>
                  <div className="card-icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                    </svg>
                  </div>
                  <div className="card-content">
                    <h3>{t("welcome.fever")}</h3>
                    <p>{t("welcome.feverDesc")}</p>
                  </div>
                </div>
              </div>

              <div className="welcome-action-row">
                <button
                  className="welcome-action-btn"
                  onClick={() => setShowBodyMap(true)}
                  disabled={loading}
                >
                  <span>📍</span>
                  <span>{t("welcome.pinpointPain")}</span>
                  <small>{t("welcome.pinpointPainDesc")}</small>
                </button>
                <button
                  className="welcome-action-btn"
                  onClick={() => setShowSymptomChecker(true)}
                  disabled={loading}
                >
                  <span>🩺</span>
                  <span>{t("welcome.symptomChecker")}</span>
                  <small>{t("welcome.symptomCheckerDesc")}</small>
                </button>
              </div>

            </div>
          ) : (
            <div className="messages-container">
              {messages.map((msg, index) => (
                <div key={msg.id || index} className={`msg-wrapper ${msg.role}`}>
                  {/* Wrap content + actions so assistant flex stays intact */}
                  <div className="msg-inner">
                    <ChatMessage message={msg} formatted={msg.formatted} selectedLanguage={selectedLanguage} />

                    {/* Simplify / Find Hospitals — only after a real answer, never on follow-up questions */}
                    {msg.role === "assistant" && !msg.isFollowup && !msg.isError && !msg.isSimplified && !msg.isStreaming && !msg.content?.includes("**Follow-up Question:**") && (
                      <div className="message-actions">
                        <button className="simplify-action" onClick={() => handleSimplify(msg.id)} disabled={simplifying}>
                          {simplifying ? `⏳ ${t("chat.simplifying")}` : `🧩 ${t("chat.simplify")}`}
                        </button>
                        <button className="simplify-action" onClick={() => {
                          const userQuery = messages.slice(0, index).reverse().find(m => m.role === "user")?.content || "";
                          handleFindHospitals(`${userQuery} ${msg.content}`);
                        }} aria-label="Find nearby hospitals">
                          🏥 {t("chat.findHospitals")}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && <LoadingSpinner />}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div className="input-container">
          {imagePreview && (
            <div className="image-preview">
              <img src={imagePreview} alt="Upload preview" />
              <button className="image-preview-remove" onClick={clearImage} aria-label="Remove image">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          )}
          <div className="input-box">
            <input
              type="file"
              ref={imageInputRef}
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelect}
              style={{ display: "none" }}
            />
            <input
              type="file"
              ref={labFileInputRef}
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleLabFileSelect}
              style={{ display: "none" }}
            />
            <button
              className="input-icon-btn image-upload-btn"
              onClick={() => imageInputRef.current?.click()}
              disabled={loading}
              aria-label={t("input.uploadImage")}
              title={t("input.uploadImage")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            </button>
            <button
              className="input-icon-btn lab-upload-btn"
              onClick={() => labFileInputRef.current?.click()}
              disabled={loading}
              aria-label={t("input.uploadLab")}
              title={t("input.uploadLab")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 3H15M9 3V14L4 20H20L15 14V3M9 3H15"></path>
                <circle cx="9" cy="17" r="1" fill="currentColor"></circle>
                <circle cx="14" cy="18.5" r="1" fill="currentColor"></circle>
              </svg>
            </button>
            <ChatInput onSend={selectedImage ? handleSendWithImage : handleSendMessage} disabled={loading} awaitingFollowup={awaitingFollowup} />
            <VoiceControls onSend={selectedImage ? handleSendWithImage : handleSendMessage} disabled={loading} selectedLanguage={selectedLanguage} />
          </div>
          <p className="disclaimer">{t("input.disclaimer")}</p>
        </div>
      </main>

      {/* Health Profile Modal */}
      {showHealthProfile && (
        <HealthProfileForm onClose={() => setShowHealthProfile(false)} />
      )}

      {/* Symptom Checker Modal */}
      {showSymptomChecker && (
        <SymptomChecker
          onSend={(query) => {
            setShowSymptomChecker(false);
            handleSendMessage(query);
          }}
          onClose={() => setShowSymptomChecker(false)}
        />
      )}

      {/* Interactive Body Map Modal */}
      {showBodyMap && (
        <InteractiveBodyMap
          onClose={() => setShowBodyMap(false)}
          onConsult={handleBodyMapConsult}
        />
      )}

      {/* Lab Upload Context Modal */}
      {showLabModal && (
        <LabUploadModal
          fileName={labFilePreview}
          onConfirm={handleSendLabResults}
          onCancel={() => {
            setShowLabModal(false);
            setSelectedLabFile(null);
            setLabFilePreview(null);
            if (labFileInputRef.current) labFileInputRef.current.value = "";
          }}
        />
      )}
    </div>
  );
}

export default App;