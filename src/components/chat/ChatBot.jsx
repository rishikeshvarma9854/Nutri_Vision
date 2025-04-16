import { useState, useRef, useEffect } from 'react';
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
import { doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';

const ChatBot = ({ context = 'general' }) => {
  const { currentUser } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const messagesEndRef = useRef(null);

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
      
      try {
        const userProfileRef = doc(db, 'userProfiles', currentUser.uid);
        const userProfileDoc = await getDoc(userProfileRef);
        
        if (userProfileDoc.exists()) {
          setUserProfile(userProfileDoc.data());
        } else {
          console.log('No user profile found');
          setUserProfile(null);
        }
      } catch (error) {
        console.error('Error loading user profile:', error);
        // Set default profile data when offline
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
    };

    loadUserProfile();
  }, [currentUser]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadUserDataAndChat = async () => {
    try {
      if (!currentUser) return;

      // Load chat messages
      const chatRef = collection(db, 'chatMessages');
      const q = query(
        chatRef,
        where('userId', '==', currentUser.uid),
        orderBy('timestamp', 'desc'),
        limit(20)
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

      console.log('Loaded messages:', loadedMessages);
      setMessages(loadedMessages);
    } catch (error) {
      console.error('Error loading chat history:', error);
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
    if (!newMessage.trim() || !currentUser) return;

    const userMessage = {
      text: newMessage.trim(),
      sender: 'user',
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setNewMessage('');
    setLoading(true);

    try {
      // Save user message to Firestore
      const chatRef = collection(db, 'chatMessages');
      await addDoc(chatRef, {
        content: userMessage.text,
        userId: currentUser.uid,
        timestamp: serverTimestamp(),
        isUser: true
      });

      // Generate and save bot response
      const response = await generateResponse(userMessage.text);
      const botMessage = {
        text: response,
        sender: 'bot',
        timestamp: new Date().toISOString()
      };

      await addDoc(chatRef, {
        content: response,
        userId: currentUser.uid,
        timestamp: serverTimestamp(),
        isUser: false
      });

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Error in chat:', error);
      const errorMessage = {
        text: "I apologize, but I encountered an error. Please try again or ask a different question.",
        sender: 'bot',
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Fab
        color="primary"
        aria-label="chat"
        sx={{ position: 'fixed', bottom: 16, right: 16 }}
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChatIcon />
      </Fab>

      <Collapse
        in={isOpen}
        sx={{
          position: 'fixed',
          bottom: 80,
          right: 16,
          width: 320,
          maxWidth: '90vw',
        }}
      >
        <Card>
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
            <Typography variant="h6">Nutrition Assistant</Typography>
            <IconButton size="small" onClick={() => setIsOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>

          <Box
            sx={{
              height: 400,
              overflowY: 'auto',
              p: 2,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            {messages.length === 0 && !loading && (
              <Typography color="text.secondary" align="center">
                Start a conversation with your nutrition assistant!
              </Typography>
            )}
            
            {messages.map((message, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  justifyContent: message.sender === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {message.sender === 'user' && (
                  <Avatar
                    sx={{
                      bgcolor: 'primary.main',
                      width: 32,
                      height: 32,
                      mr: 1,
                    }}
                  >
                    {currentUser?.displayName?.charAt(0).toUpperCase()}
                  </Avatar>
                )}
                <Card
                  sx={{
                    maxWidth: '80%',
                    bgcolor: message.sender === 'user' ? 'primary.main' : 'grey.100',
                  }}
                >
                  <CardContent sx={{ py: 1, px: 2, '&:last-child': { pb: 1 } }}>
                    <Typography
                      variant="body2"
                      sx={{ color: message.sender === 'user' ? 'white' : 'text.primary' }}
                    >
                      {message.text}
                    </Typography>
                  </CardContent>
                </Card>
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
    </>
  );
};

export default ChatBot; 