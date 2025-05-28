import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  IconButton,
  Fab,
  Collapse,
  CircularProgress,
  Avatar,
  Alert,
} from '@mui/material';
import {
  Chat as ChatIcon,
  Close as CloseIcon,
  Send as SendIcon,
} from '@mui/icons-material';
import { auth, db } from '../../firebase/config';
import { doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import debounce from 'lodash/debounce';

// Cache for user profiles and messages
const userProfileCache = new Map();
const messageCache = new Map();
const WRITE_BATCH_DELAY = 300000; // 5 minutes
const MESSAGE_BATCH_SIZE = 20;
const CACHE_EXPIRY = 30 * 60 * 1000; // 30 minutes
const MAX_PENDING_MESSAGES = 50;
const WRITE_INTERVAL = 300000; // 5 minutes
const MAX_CACHED_MESSAGES = 50;
const MESSAGE_CACHE_KEY = 'chatMessageCache';
let lastWriteTime = 0;

const formatMessage = (text) => {
  // Split the text into sections (paragraphs)
  const sections = text.split('\n\n').map(section => section.trim()).filter(section => section);
  
  // Format each section
  const formattedSections = sections.map(section => {
    const lines = section.split('\n').map(line => line.trim()).filter(line => line);
    
    // Check if this is a bullet point list section
    const isBulletList = lines.some(line => line.startsWith('*') || line.startsWith('•'));
    
    return lines.map(line => {
      // Remove markdown stars but preserve text and formatting
      line = line.replace(/\*\*([^*]+)\*\*/g, (_, text) => `<strong>${text}</strong>`);
      
      // Handle bullet points (both * and •)
      if (line.startsWith('*') || line.startsWith('•')) {
        return line.replace(/^[*•]\s*/, '• ');
      }
      
      return line;
    }).join('\n');
  });
  
  return formattedSections.join('\n\n');
};

const MessageContent = ({ text }) => {
  const lines = text.split('\n');
  
  return (
    <>
      {lines.map((line, i) => {
        // Check if line contains bold text (wrapped in <strong> tags)
        const hasBoldText = line.includes('<strong>');
        
        // Split line into parts if it contains bold text
        if (hasBoldText) {
          const parts = line.split(/(<strong>.*?<\/strong>)/g);
          return (
            <Typography
              key={i}
              variant="body2"
              component="div"
              className={line.trim().startsWith('•') ? 'bullet-point' : ''}
              sx={{
                pl: line.trim().startsWith('•') ? 2 : 0,
                my: 0.5,
                '& strong': {
                  fontWeight: 'bold'
                }
              }}
            >
              {parts.map((part, j) => {
                if (part.startsWith('<strong>')) {
                  return <strong key={j}>{part.replace(/<\/?strong>/g, '')}</strong>;
                }
                return part;
              })}
            </Typography>
          );
        }
        
        return (
          <Typography
            key={i}
            variant="body2"
            component="div"
            className={line.trim().startsWith('•') ? 'bullet-point' : ''}
            sx={{
              pl: line.trim().startsWith('•') ? 2 : 0,
              fontWeight: line.trim().startsWith('•') ? 'normal' : 
                        (line.length > 0 && line === line.toUpperCase()) ? 'bold' : 'normal',
              my: 0.5
            }}
          >
            {line.trim().startsWith('•') ? line.substring(1).trim() : line}
          </Typography>
        );
      })}
    </>
  );
};

const ChatBot = ({ context = 'general' }) => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const messagesEndRef = useRef(null);
  const pendingMessages = useRef([]);
  const batchTimeout = useRef(null);
  const lastWriteTime = useRef(0);

  // Load cached messages on mount
  useEffect(() => {
    const cached = localStorage.getItem(MESSAGE_CACHE_KEY);
    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        setMessages(parsedCache);
        pendingMessages.current = parsedCache;
      } catch (error) {
        console.error('Error loading cached messages:', error);
      }
    }
  }, []);

  // Add this function to check if write is allowed
  const canWrite = () => {
    const now = Date.now();
    return now - lastWriteTime.current >= WRITE_INTERVAL;
  };

  // Function to save messages to Firestore
  const saveMessagesToFirestore = async (messagesToSave) => {
    if (!currentUser || !messagesToSave.length) return;

    const now = Date.now();
    // Only write if enough time has passed since last write
    if (now - lastWriteTime.current < WRITE_INTERVAL) {
      return;
    }

    try {
      const batch = writeBatch(db);
      const chatRef = collection(db, 'chatMessages');

      // Only save the last MAX_CACHED_MESSAGES messages
      const recentMessages = messagesToSave.slice(-MAX_CACHED_MESSAGES);

      recentMessages.forEach(message => {
        const docRef = doc(chatRef);
        batch.set(docRef, {
          content: message.text,
          userId: currentUser.uid,
          timestamp: serverTimestamp(),
          isUser: message.sender === 'user'
        });
      });

      await batch.commit();
      lastWriteTime.current = now;
      
      // Clear the cache after successful write
      pendingMessages.current = [];
      
      // Update localStorage
      localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(messages));
    } catch (error) {
      console.error('Error saving messages:', error);
      // Keep messages in cache if save fails
      pendingMessages.current = [...pendingMessages.current, ...messagesToSave];
    }
  };

  // Debounced save function
  const debouncedSave = useCallback(
    debounce((messages) => {
      saveMessagesToFirestore(messages);
    }, WRITE_INTERVAL),
    []
  );

  useEffect(() => {
    if (isOpen) {
      loadUserDataAndChat();
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const loadUserProfile = async () => {
      if (!currentUser) return;
      
      // Check cache first
      const cachedProfile = userProfileCache.get(currentUser.uid);
      if (cachedProfile && Date.now() - cachedProfile.timestamp < CACHE_EXPIRY) {
        setUserProfile(cachedProfile.data);
        return;
      }
      
      try {
        const userProfileRef = doc(db, 'userProfiles', currentUser.uid);
        const userProfileDoc = await getDoc(userProfileRef);
        
        if (userProfileDoc.exists()) {
          const profileData = userProfileDoc.data();
          setUserProfile(profileData);
          // Update cache
          userProfileCache.set(currentUser.uid, {
            data: profileData,
            timestamp: Date.now()
          });
        } else {
          console.log('No user profile found');
          setUserProfile(null);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
        // Use cached data if available when offline
        if (cachedProfile) {
          setUserProfile(cachedProfile.data);
        } else {
          setUserProfile({
            age: 'unknown',
            height: 'unknown',
            weight: 'unknown',
            targetWeight: 'unknown',
            goal: 'unknown',
            dietaryType: 'unknown',
            activityLevel: 'unknown',
            medicalConditions: [],
            foodAllergies: [],
            dailyCalories: 'unknown'
          });
        }
      }
    };

    loadUserProfile();
  }, [currentUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadUserDataAndChat = async () => {
    if (!currentUser) return;

    // Check cache first
    const cachedMessages = messageCache.get(currentUser.uid);
    if (cachedMessages && Date.now() - cachedMessages.timestamp < CACHE_EXPIRY) {
      setMessages(cachedMessages.data);
      return;
    }

    try {
      const chatRef = collection(db, 'chatMessages');
      const q = query(
        chatRef,
        where('userId', '==', currentUser.uid),
        orderBy('timestamp', 'desc'),
        limit(MESSAGE_BATCH_SIZE)
      );
      
      const querySnapshot = await getDocs(q);
      const loadedMessages = querySnapshot.docs
        .map(doc => {
          const data = doc.data();
          return {
            text: data.content,
            sender: data.isUser ? 'user' : 'bot',
            timestamp: data.timestamp?.toDate().toISOString() || new Date().toISOString()
          };
        })
        .reverse();

      setMessages(loadedMessages);
      // Update cache
      messageCache.set(currentUser.uid, {
        data: loadedMessages,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Error loading chat history:', error);
      // Use cached messages if available when offline
      if (cachedMessages) {
        setMessages(cachedMessages.data);
      }
    }
  };

  const generateFallbackResponse = (userInput) => {
    // Simple fallback responses based on common nutrition-related topics
    const lowerInput = userInput.toLowerCase();
    
    if (lowerInput.includes('bmi') || lowerInput.includes('weight') || lowerInput.includes('body mass')) {
      return `Based on your profile:
      - Height: ${userProfile.height || 'Not specified'} cm
      - Weight: ${userProfile.weight || 'Not specified'} kg
      
      For accurate BMI calculation and weight management advice, I recommend:
      1. Consulting with a healthcare professional
      2. Using a reliable BMI calculator
      3. Considering your activity level and dietary habits
      
      Would you like more specific information about any of these aspects?`;
    }
    
    if (lowerInput.includes('diet') || lowerInput.includes('food') || lowerInput.includes('eat')) {
      return `Considering your profile:
      - Dietary Preferences: ${userProfile.dietaryPreferences || 'Not specified'}
      - Allergies: ${userProfile.allergies || 'None'}
      
      For personalized dietary advice, I recommend:
      1. Consulting with a registered dietitian
      2. Following balanced meal guidelines
      3. Considering your specific dietary needs and restrictions
      
      Would you like more information about any specific aspect of nutrition?`;
    }
    
    if (lowerInput.includes('exercise') || lowerInput.includes('workout') || lowerInput.includes('activity')) {
      return `Based on your profile:
      - Activity Level: ${userProfile.activityLevel || 'Not specified'}
      - Health Conditions: ${userProfile.healthConditions || 'None'}
      
      For exercise recommendations:
      1. Start with activities appropriate for your current fitness level
      2. Gradually increase intensity
      3. Consider any health conditions or limitations
      4. Aim for at least 150 minutes of moderate activity per week
      
      Would you like specific exercise recommendations?`;
    }
    
    return "I apologize, but I'm having trouble connecting to the AI service. Please try asking your question again or contact support if the issue persists.";
  };

  const generateResponse = async (userInput) => {
    try {
      const prompt = `You are a nutrition and health expert chatbot. 
      User Profile:
      - Age: ${userProfile.age || 'Not specified'}
      - Gender: ${userProfile.gender || 'Not specified'}
      - Weight: ${userProfile.weight || 'Not specified'} kg
      - Height: ${userProfile.height || 'Not specified'} cm
      - Activity Level: ${userProfile.activityLevel || 'Not specified'}
      - Dietary Preferences: ${userProfile.dietaryPreferences || 'Not specified'}
      - Health Conditions: ${userProfile.healthConditions || 'None'}
      - Allergies: ${userProfile.allergies || 'None'}
      - Goals: ${userProfile.goals || 'Not specified'}

      Guidelines:
      1. Provide accurate, evidence-based information about nutrition and health
      2. Consider the user's profile when giving advice
      3. Be clear and concise
      4. If asked about medical conditions, recommend consulting a healthcare professional
      5. For weight-related questions, provide balanced advice considering the user's profile
      6. For exercise questions, consider the user's activity level and any health conditions
      7. For diet questions, consider dietary preferences and allergies
      8. Always maintain a professional and supportive tone

      User Question: ${userInput}

      Please provide a helpful response that considers the user's profile and follows these guidelines.`;

      const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=AIzaSyBS--qFPRpUxyf1MQBcq2I0Gb8GRW7iUrk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: prompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('Error generating response:', error);
      return generateFallbackResponse(userInput);
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim()) return;

    const userMessage = {
      text: newMessage.trim(),
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    // Update UI immediately
    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setLoading(true);

    try {
      // Add to message cache
      pendingMessages.current.push(userMessage);

      // Generate bot response
      const response = await generateResponse(userMessage.text);
      const botMessage = {
        text: response,
        sender: 'bot',
        timestamp: new Date().toISOString()
      };

      // Update UI with bot message
      setMessages(prev => [...prev, botMessage]);
      pendingMessages.current.push(botMessage);

      // Save to localStorage
      const updatedMessages = [...messages, userMessage, botMessage];
      localStorage.setItem(MESSAGE_CACHE_KEY, JSON.stringify(updatedMessages));

      // Trigger debounced save to Firestore
      debouncedSave(pendingMessages.current);
    } catch (error) {
      console.error('Error in chat:', error);
      const errorMessage = {
        text: "I apologize, but I encountered an error. Please try again.",
        sender: 'bot',
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Save messages to Firestore when component unmounts
  useEffect(() => {
    return () => {
      if (pendingMessages.current.length > 0) {
        saveMessagesToFirestore(pendingMessages.current);
      }
    };
  }, []);

  return (
    <Box sx={{ position: 'fixed', bottom: 16, right: 16, zIndex: 1200 }}>
      <Collapse
        in={isOpen}
        sx={{
          position: 'absolute',
          bottom: 64,
          right: 0,
          width: 350,
          maxWidth: '90vw',
        }}
      >
        <Card sx={{ 
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: 3
        }}>
          <Box
            sx={{
              p: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            <Typography variant="h6">Nuitron</Typography>
            <IconButton size="small" onClick={() => setIsOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>

          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2
            }}
          >
            {messages.length === 0 && !loading && (
              <Typography color="text.secondary" align="center">
                Start a conversation with your Nuitron Assistant!
              </Typography>
            )}
            
            {messages.map((message, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start',
                  mb: 1
                }}
              >
                {message.sender === 'bot' && (
                  <Avatar 
                    sx={{ 
                      width: 32, 
                      height: 32, 
                      mr: 1,
                      bgcolor: 'primary.main'
                    }}
                  >
                    <ChatIcon sx={{ width: 20, height: 20 }} />
                  </Avatar>
                )}
                <Box
                  sx={{
                    maxWidth: '75%',
                    p: 2,
                    bgcolor: message.sender === 'user' ? 'primary.main' : 'grey.100',
                    color: message.sender === 'user' ? 'white' : 'text.primary',
                    borderRadius: 2,
                    whiteSpace: 'pre-wrap',
                    '& .bullet-point': {
                      display: 'flex',
                      alignItems: 'flex-start',
                      '&::before': {
                        content: '"•"',
                        marginRight: '8px',
                        marginLeft: '-12px'
                      }
                    }
                  }}
                >
                  <MessageContent text={formatMessage(message.text)} />
                </Box>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Box>

          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>
            <TextField
              fullWidth
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !loading && handleSend()}
              disabled={loading}
              InputProps={{
                endAdornment: (
                  <IconButton
                    onClick={handleSend}
                    disabled={!newMessage.trim() || loading}
                  >
                    {loading ? (
                      <CircularProgress size={24} />
                    ) : (
                      <SendIcon />
                    )}
                  </IconButton>
                ),
              }}
            />
          </Box>
        </Card>
      </Collapse>
      
      <Fab 
        color="primary" 
        onClick={() => setIsOpen(!isOpen)}
        sx={{ 
          boxShadow: 3,
          '&:hover': {
            transform: 'scale(1.05)',
            transition: 'transform 0.2s'
          }
        }}
      >
        {isOpen ? <CloseIcon /> : <ChatIcon />}
      </Fab>
    </Box>
  );
};

export default ChatBot; 