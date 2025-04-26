import { createContext, useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { sendChatMessage, getEmotions } from "../services/api";

export const Context = createContext();

const ContextProvider = (props) => {
    const [input, setInput] = useState("");
    const [recentPrompt, setRecentPrompt] = useState("");
    const [prevPrompts, setPrevPrompts] = useState([]);
    const [showResult, setShowResult] = useState(false);
    const [loading, setLoading] = useState(false);
    const [resultData, setResultData] = useState("");
    const [chatHistory, setChatHistory] = useState([]);
    const [chats, setChats] = useState([]); // all saved chats
    const [currentChatId, setCurrentChatId] = useState(null); // active chat
    const [user, setUser] = useState(null); // user information
    const [emotions, setEmotions] = useState({
        user: {},
        assistant: {}
    });

    // Reset state when user changes
    useEffect(() => {
        if (!user) {
            // Clear chat history and other user-specific data when user is null
            setChatHistory([]);
            setChats([]);
            setCurrentChatId(null);
            setResultData("");
            setRecentPrompt("");
            setEmotions({
                user: {},
                assistant: {}
            });
            return;
        }

        // When a new user logs in, reset chat-related state
        setChatHistory([]);
        setCurrentChatId(null);

        // Fetch emotions periodically for the current user
        const fetchEmotions = async () => {
            try {
                const emotionData = await getEmotions(user.user_id);
                setEmotions(emotionData);
            } catch (error) {
                console.error("Error fetching emotions:", error);
            }
        };

        // Initial fetch
        fetchEmotions();

        // Set up interval for periodic updates
        const intervalId = setInterval(fetchEmotions, 2000);

        // Clean up interval on unmount or when user changes
        return () => clearInterval(intervalId);
    }, [user]);

    const delayPara = (index, nextWord) => {
        setTimeout(() => {
          setResultData(prev => prev + nextWord); // This is what makes the typing visible
        }, 75 * index);
    };

    const newChat = () => {
        setChatHistory([]);
        setCurrentChatId(null);
        setResultData("");
        setRecentPrompt("");
    };

    const loadChat = (chatId) => {
        const chat = chats.find(c => c.id === chatId);
        if (!chat) return;
        setChatHistory(chat.history);
        setCurrentChatId(chat.id);
        setShowResult(true);
        setResultData("");
    };

    const onSent = async (prompt) => {
        const message = prompt || input;
        if (!message.trim() || !user) return;

        setInput("");
        setResultData("");
        setLoading(true);
        setShowResult(true);
        setRecentPrompt(message);

        // Create a new chat if none exists
        if (!currentChatId) {
            const newId = uuidv4();
            const newChat = {
                id: newId,
                title: message.length > 20 ? message.slice(0, 20) + "..." : message,
                history: [{ sender: "user", message }]
            };
            setChats(prev => [...prev, newChat]);
            setCurrentChatId(newId);
            setChatHistory([{ sender: "user", message }]);
        } else {
            setChatHistory(prev => [...prev, { sender: "user", message }]);
            setChats(prev => prev.map(chat =>
                chat.id === currentChatId
                ? { ...chat, history: [...chat.history, { sender: "user", message }] }
                : chat
            ));
        }

        try {
            // Send message to backend API
            const response = await sendChatMessage(message, user.user_id, user.username);

            // Update emotions if available
            if (response.emotions) {
                setEmotions(response.emotions);
            }

            // Get the response text
            const responseText = response.response;

            // Display the response with typing effect
            const responseArray = responseText.split(" ");
            let fullMessage = "";

            responseArray.forEach((word, i) => {
                setTimeout(() => {
                    fullMessage += word + " ";
                    setResultData(fullMessage);
                }, 75 * i);
            });

            setTimeout(() => {
                setChatHistory(prev => [...prev, { sender: "bot", message: fullMessage.trim() }]);
                setResultData("");
                setLoading(false);

                // Update chat list with bot reply
                setChats(prev => prev.map(chat =>
                    chat.id === currentChatId
                    ? { ...chat, history: [...chat.history, { sender: "bot", message: fullMessage.trim() }] }
                    : chat
                ));
            }, 75 * responseArray.length + 100);
        } catch (error) {
            console.error("Error sending message:", error);
            setResultData("Sorry, there was an error processing your message. Please try again.");
            setLoading(false);
        }
    };

    const contextValue = {
        prevPrompts,
        setPrevPrompts,
        onSent,
        setRecentPrompt,
        recentPrompt,
        showResult,
        loading,
        resultData,
        input,
        setInput,
        chatHistory,
        setChatHistory,
        chats,
        setChats,
        currentChatId,
        setCurrentChatId,
        newChat,
        loadChat,
        user,
        setUser,
        emotions
    }

    return(
        <Context.Provider value={contextValue}>
            {props.children}
        </Context.Provider>
    )
}

export default ContextProvider