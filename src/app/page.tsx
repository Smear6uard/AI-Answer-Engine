"use client";

import { useState, useEffect, useRef, useCallback } from "react";

type Message = {
  role: "user" | "ai";
  content: string;
  displayedContent?: string;
  isError?: boolean;
  isStreaming?: boolean;
  sources?: Array<{
    url: string;
    scraperUsed: string | null;
    error: string | null;
  }>;
  attachment?: {
    filename: string;
    type: string;
  };
};

const STORAGE_KEY = "ai-answer-engine-messages";
const GREETING = "Ready to analyze websites, documents, and answer queries.";
const TYPEWRITER_SPEED = 80;
const TYPEWRITER_CHUNK_SIZE = 1;

export default function Home() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{ content: string; filename: string; type: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const typewriterRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const savedMessages = localStorage.getItem(STORAGE_KEY);
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const restored = parsed.map((msg: Message) => ({
            ...msg,
            displayedContent: msg.content,
            isStreaming: false,
          }));
          setMessages(restored);
        } else {
          setMessages([{ role: "ai", content: GREETING, displayedContent: GREETING }]);
        }
      } catch {
        setMessages([{ role: "ai", content: GREETING, displayedContent: GREETING }]);
      }
    } else {
      setMessages([{ role: "ai", content: GREETING, displayedContent: GREETING }]);
    }
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (isInitialized && messages.length > 0) {
      const toSave = messages.filter(m => !m.isStreaming).map(m => {
        const { role, content, isError, sources, attachment } = m;
        return { role, content, isError, sources, attachment };
      });
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    }
  }, [messages, isInitialized]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== "ai") {
      if (typewriterRef.current) {
        clearTimeout(typewriterRef.current);
        typewriterRef.current = null;
      }
      return;
    }

    const fullContent = lastMessage.content;
    const currentDisplay = lastMessage.displayedContent || "";

    if (currentDisplay.length < fullContent.length) {
      typewriterRef.current = setTimeout(() => {
        setMessages(prev => {
          const newMessages = [...prev];
          const last = newMessages[newMessages.length - 1];
          if (last && last.role === "ai") {
            const newLength = Math.min(
              (last.displayedContent?.length || 0) + TYPEWRITER_CHUNK_SIZE,
              fullContent.length
            );
            last.displayedContent = fullContent.slice(0, newLength);
          }
          return newMessages;
        });
      }, TYPEWRITER_SPEED);
    } else {
      if (typewriterRef.current) {
        clearTimeout(typewriterRef.current);
        typewriterRef.current = null;
      }
    }

    return () => {
      if (typewriterRef.current) {
        clearTimeout(typewriterRef.current);
      }
    };
  }, [messages]);

  const handleFileUpload = useCallback(async (file: File) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    if (!allowedTypes.includes(file.type)) {
      setMessages(prev => [...prev, {
        role: "ai",
        content: "[ERROR] Invalid file type. Accepted formats: PDF, DOCX",
        displayedContent: "[ERROR] Invalid file type. Accepted formats: PDF, DOCX",
        isError: true,
      }]);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setMessages(prev => [...prev, {
        role: "ai",
        content: "[ERROR] File exceeds 10MB limit.",
        displayedContent: "[ERROR] File exceeds 10MB limit.",
        isError: true,
      }]);
      return;
    }

    setIsLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      setUploadedFile({
        content: data.content,
        filename: data.filename,
        type: data.type,
      });

      const successMsg = `[UPLOAD] ${data.filename}\nType: ${data.type.toUpperCase()}${data.pageCount ? ` | Pages: ${data.pageCount}` : ''}\nStatus: Ready for analysis`;
      setMessages(prev => [...prev, {
        role: "ai",
        content: successMsg,
        displayedContent: successMsg,
        attachment: { filename: data.filename, type: data.type },
      }]);
    } catch (error) {
      const errorMsg = `[ERROR] Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      setMessages(prev => [...prev, {
        role: "ai",
        content: errorMsg,
        displayedContent: errorMsg,
        isError: true,
      }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  }, [handleFileUpload]);

  const handleSend = useCallback(async () => {
    if (!message.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: message,
      displayedContent: message,
    };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    const currentMessage = message;
    setMessage("");
    setIsLoading(true);

    const streamingMessage: Message = {
      role: "ai",
      content: "",
      displayedContent: "",
      isStreaming: true,
      attachment: uploadedFile ? { filename: uploadedFile.filename, type: uploadedFile.type } : undefined
    };
    setMessages(prev => [...prev, streamingMessage]);

    abortControllerRef.current = new AbortController();

    let messageToSend = currentMessage;
    if (uploadedFile) {
      let documentContent = uploadedFile.content;
      const MAX_DOC_LENGTH = 80000;
      
      if (documentContent.length > MAX_DOC_LENGTH) {
        const firstPart = documentContent.slice(0, Math.floor(MAX_DOC_LENGTH * 0.6));
        const lastPart = documentContent.slice(-Math.floor(MAX_DOC_LENGTH * 0.2));
        documentContent = `${firstPart}\n\n[... ${documentContent.length - firstPart.length - lastPart.length} characters truncated ...]\n\n${lastPart}`;
      }
      
      messageToSend = `[Analyzing uploaded document: ${uploadedFile.filename}]\n\nDocument content:\n${documentContent}\n\nUser question: ${currentMessage}`;
      setUploadedFile(null);
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageToSend,
          history: updatedMessages,
          stream: true,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = `[ERROR] ${errorData.error || `Request failed: ${response.status}`}`;
        setMessages(prev => {
          const newMessages = [...prev];
          newMessages[newMessages.length - 1] = {
            role: "ai",
            content: errorMessage,
            displayedContent: errorMessage,
            isError: true,
            isStreaming: false,
          };
          return newMessages;
        });
        return;
      }

      const sourcesHeader = response.headers.get("X-Sources");
      let sources: Message["sources"];
      if (sourcesHeader) {
        try {
          sources = JSON.parse(sourcesHeader);
        } catch {
          sources = undefined;
        }
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder('utf-8');
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullContent += chunk;

        setMessages(prev => {
          const newMessages = [...prev];
          const lastIndex = newMessages.length - 1;
          if (lastIndex >= 0 && newMessages[lastIndex].role === "ai") {
            newMessages[lastIndex] = {
              role: "ai",
              content: fullContent,
              displayedContent: newMessages[lastIndex].displayedContent || "",
              isStreaming: true,
              sources,
              attachment: newMessages[lastIndex].attachment,
            };
          }
          return newMessages;
        });
      }

      setMessages(prev => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        if (lastIndex >= 0 && newMessages[lastIndex].role === "ai") {
          newMessages[lastIndex] = {
            role: "ai",
            content: fullContent,
            displayedContent: fullContent,
            isStreaming: false,
            sources,
            attachment: newMessages[lastIndex].attachment,
          };
        }
        return newMessages;
      });

    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      const errorMsg = "[ERROR] Connection failed. Check network and retry.";
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1] = {
          role: "ai",
          content: errorMsg,
          displayedContent: errorMsg,
          isError: true,
          isStreaming: false,
        };
        return newMessages;
      });
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [message, messages, isLoading, uploadedFile]);

  const handleNewChat = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    if (typewriterRef.current) {
      clearTimeout(typewriterRef.current);
    }
    setMessages([{ role: "ai", content: GREETING, displayedContent: GREETING }]);
    setMessage("");
    setIsLoading(false);
    setUploadedFile(null);
  };

  const handleExport = (format: "markdown" | "json") => {
    const timestamp = new Date().toISOString().split("T")[0];
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === "markdown") {
      content = `# AI Answer Engine - Chat Export\n_${timestamp}_\n\n---\n\n` + messages
        .map(msg => {
          const role = msg.role === "ai" ? "## [SYSTEM]" : "## [USER]";
          const text = msg.content;
          const sources = msg.sources?.length
            ? `\n\n> Sources: ${msg.sources.map(s => s.url).join(", ")}`
            : "";
          return `${role}\n\`\`\`\n${text}\n\`\`\`${sources}`;
        })
        .join("\n\n---\n\n");
      filename = `chat-export-${timestamp}.md`;
      mimeType = "text/markdown";
    } else {
      content = JSON.stringify(messages, null, 2);
      filename = `chat-export-${timestamp}.json`;
      mimeType = "application/json";
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getDisplayContent = (msg: Message) => {
    if (msg.isStreaming) {
      return msg.displayedContent || "";
    }
    return msg.displayedContent || msg.content;
  };

  const formatMessageContent = (text: string) => {
    if (!text) return text;
    
    const paragraphs = text.split(/\n\s*\n/);
    if (paragraphs.length === 1) {
      const lines = text.split('\n');
      return lines.map((line, idx) => (
        <div key={idx} style={{ marginBottom: idx < lines.length - 1 ? '8px' : '0' }}>
          {line || '\u00A0'}
        </div>
      ));
    }
    
    return paragraphs.map((para, idx) => {
      if (para.trim() === '') return null;
      
      const lines = para.split('\n');
      return (
        <div key={idx} style={{ marginBottom: idx < paragraphs.length - 1 ? '16px' : '0' }}>
          {lines.map((line, lineIdx) => {
            if (line.trim() === '') return <br key={lineIdx} />;
            
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
              <div key={lineIdx} style={{ marginBottom: lineIdx < lines.length - 1 ? '4px' : '0' }}>
                {parts.map((part, partIdx) => {
                  if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={partIdx} style={{ color: '#ffffff', fontWeight: '600' }}>{part.slice(2, -2)}</strong>;
                  }
                  return <span key={partIdx}>{part}</span>;
                })}
              </div>
            );
          })}
        </div>
      );
    }).filter(Boolean);
  };

  const formatTime = () => {
    return new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  if (!isInitialized) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a0a',
        color: '#e8e8e8',
        fontFamily: '"IBM Plex Mono", "SF Mono", monospace',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <div style={{ fontSize: '14px', color: '#4a4a4a' }}>INITIALIZING...</div>
      </div>
    );
  }

  return (
    <div
      style={{
        height: '100vh',
        backgroundColor: '#0a0a0a',
        color: '#e8e8e8',
        fontFamily: '"IBM Plex Mono", "SF Mono", monospace',
        position: 'relative',
        overflowX: 'hidden',
        overflowY: 'auto'
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div style={{
        position: 'fixed',
        inset: 0,
        opacity: 0.03,
        pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
      }} />

      {isDragging && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(255, 107, 91, 0.1)',
          backdropFilter: 'blur(4px)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '2px dashed #ff6b5b',
        }}>
          <div style={{
            textAlign: 'center',
            color: '#ff6b5b',
            fontSize: '14px',
            letterSpacing: '0.1em'
          }}>
            [DROP FILE]
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx"
        onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
        style={{ display: 'none' }}
      />

      <header style={{
        position: 'sticky',
        top: 0,
        backgroundColor: '#0a0a0a',
        zIndex: 100,
        width: '100%',
        paddingTop: '16px',
        paddingBottom: '24px',
        borderBottom: '1px solid #1a1a1a',
        marginBottom: '64px'
      }}>
        <div style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline'
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#ff6b5b',
              boxShadow: '0 0 12px #ff6b5b40'
            }} />
            <h1 style={{
              fontSize: '14px',
              fontWeight: '500',
              letterSpacing: '0.1em',
              margin: 0,
              color: '#ffffff'
            }}>
              ANSWER ENGINE
            </h1>
            <span style={{
              fontSize: '11px',
              color: '#4a4a4a',
              fontWeight: '400'
            }}>
              v2.0
            </span>
          </div>
          
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ position: 'relative' }}>
              <button 
                onClick={() => handleExport('markdown')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#4a4a4a',
                  fontSize: '11px',
                  letterSpacing: '0.05em',
                  cursor: 'pointer',
                  padding: '4px 0',
                  transition: 'color 0.2s ease'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#4a4a4a')}
              >
                EXPORT
              </button>
            </div>
            <button
              onClick={handleNewChat}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#4a4a4a',
                fontSize: '11px',
                letterSpacing: '0.05em',
                cursor: 'pointer',
                padding: '4px 0',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#888')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#4a4a4a')}
            >
              NEW
            </button>
          </div>
        </div>
      </header>

      <div style={{
        maxWidth: '900px',
        margin: '0 auto',
        padding: '0 24px',
        position: 'relative',
        paddingBottom: '200px',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          marginBottom: '80px'
        }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: 'flex',
              gap: '24px',
              alignItems: 'flex-start'
            }}>
              <span style={{
                fontSize: '11px',
                color: '#2a2a2a',
                fontFamily: '"IBM Plex Mono", monospace',
                minWidth: '64px',
                paddingTop: '2px'
              }}>
                {formatTime()}
              </span>
              
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '10px',
                  letterSpacing: '0.15em',
                  marginBottom: '8px',
                  color: msg.role === 'user' ? '#ff6b5b' : msg.isError ? '#ff4444' : '#4a4a4a',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <span>{msg.role === 'user' ? '▸ YOU' : '◆ SYSTEM'}</span>
                  {msg.isStreaming && <span style={{ color: '#4a4a4a' }}>[STREAMING...]</span>}
                  {msg.attachment && (
                    <span style={{
                      fontSize: '9px',
                      color: '#ff6b5b',
                      backgroundColor: 'rgba(255, 107, 91, 0.1)',
                      padding: '2px 8px',
                      borderRadius: '12px',
                      letterSpacing: '0.05em'
                    }}>
                      Analyzing: {msg.attachment.filename}
                    </span>
                  )}
                </div>
                
                <div style={{
                  fontSize: '14px',
                  lineHeight: '1.8',
                  color: msg.role === 'user' ? '#ffffff' : msg.isError ? '#ff4444' : '#d4d4d4',
                  maxWidth: '640px',
                  whiteSpace: 'pre-wrap',
                  fontFamily: '"IBM Plex Mono", monospace',
                  ...(msg.isError && {
                    background: 'rgba(255, 100, 100, 0.08)',
                    borderLeft: '2px solid #ff6b5b',
                    padding: '12px 16px',
                    borderRadius: '4px',
                    marginTop: '4px'
                  })
                }}>
                  {formatMessageContent(getDisplayContent(msg))}
                  {msg.isStreaming && msg.displayedContent !== msg.content && (
                    <span style={{
                      display: 'inline-block',
                      width: '2px',
                      height: '14px',
                      backgroundColor: '#ff6b5b',
                      marginLeft: '2px',
                      animation: 'blink 1s infinite'
                    }} />
                  )}
                </div>

                {msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
                  <div style={{
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid #1a1a1a'
                  }}>
                    <div style={{ fontSize: '10px', color: '#4a4a4a', marginBottom: '8px', letterSpacing: '0.05em' }}>
                      [SOURCES]
                    </div>
                    {msg.sources.map((source, idx) => (
                      <div key={idx} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '11px',
                        marginTop: '4px'
                      }}>
                        <span style={{ color: source.error ? '#ff4444' : '#ff6b5b' }}>
                          {source.error ? '✗' : '✓'}
                        </span>
                        <span style={{ color: '#4a4a4a', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {source.url}
                        </span>
                        {source.scraperUsed && (
                          <span style={{ color: '#2a2a2a', fontSize: '10px' }}>
                            [{source.scraperUsed}]
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div style={{
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        backgroundColor: '#0a0a0a',
        borderTop: '1px solid #1a1a1a',
        padding: '24px'
      }}>
        <div style={{
          maxWidth: '900px',
          margin: '0 auto',
          display: 'flex',
          gap: '16px',
          alignItems: 'center'
        }}>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              border: '1px solid #2a2a2a',
              backgroundColor: 'transparent',
              color: '#4a4a4a',
              cursor: isLoading ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              opacity: isLoading ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!isLoading) {
                e.currentTarget.style.borderColor = '#3a3a3a';
                e.currentTarget.style.color = '#888';
              }
            }}
            onMouseLeave={(e) => {
              if (!isLoading) {
                e.currentTarget.style.borderColor = '#2a2a2a';
                e.currentTarget.style.color = '#4a4a4a';
              }
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 5v14M5 12l7-7 7 7"/>
            </svg>
          </button>
          
          <div style={{
            flex: 1,
            position: 'relative'
          }}>
            {uploadedFile && (
              <div style={{
                position: 'absolute',
                top: '-28px',
                left: 0,
                fontSize: '11px',
                color: '#ff6b5b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span>[FILE]</span>
                <span style={{ color: '#888' }}>{uploadedFile.filename}</span>
                <button
                  onClick={() => setUploadedFile(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#4a4a4a',
                    cursor: 'pointer',
                    padding: '0',
                    fontSize: '12px'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#ff4444')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#4a4a4a')}
                >
                  [×]
                </button>
              </div>
            )}
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder={uploadedFile ? "Query document..." : "Paste URL or ask a question"}
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '12px 16px',
                backgroundColor: '#111111',
                border: '1px solid #2a2a2a',
                borderRadius: '8px',
                color: '#e8e8e8',
                fontSize: '14px',
                fontFamily: '"IBM Plex Mono", monospace',
                outline: 'none',
                transition: 'border-color 0.2s ease',
                opacity: isLoading ? 0.5 : 1
              }}
              onFocus={(e) => e.target.style.borderColor = '#3a3a3a'}
              onBlur={(e) => e.target.style.borderColor = '#2a2a2a'}
            />
          </div>
          
          <button 
            onClick={handleSend}
            disabled={isLoading || !message.trim()}
            style={{
              padding: '12px 24px',
              backgroundColor: message && !isLoading ? '#ff6b5b' : '#1a1a1a',
              border: 'none',
              borderRadius: '8px',
              color: message && !isLoading ? '#0a0a0a' : '#3a3a3a',
              fontSize: '12px',
              fontWeight: '600',
              letterSpacing: '0.1em',
              fontFamily: '"IBM Plex Mono", monospace',
              cursor: message && !isLoading ? 'pointer' : 'default',
              transition: 'all 0.2s ease',
              flexShrink: 0
            }}
            onMouseEnter={(e) => {
              if (message && !isLoading) {
                e.currentTarget.style.backgroundColor = '#ff8577';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 20px #ff6b5b30';
              }
            }}
            onMouseLeave={(e) => {
              if (message && !isLoading) {
                e.currentTarget.style.backgroundColor = '#ff6b5b';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }
            }}
          >
            {isLoading ? '...' : 'EXEC'}
          </button>
        </div>
        
        <div style={{
          maxWidth: '900px',
          margin: '12px auto 0',
          display: 'flex',
          gap: '24px',
          justifyContent: 'center'
        }}>
          {['Multi-URL', 'PDF & DOCX', 'Local storage'].map((feature, i) => (
            <span key={i} style={{
              fontSize: '10px',
              color: '#2a2a2a',
              letterSpacing: '0.05em'
            }}>
              {feature}
            </span>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
