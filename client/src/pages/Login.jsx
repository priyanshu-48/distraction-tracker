import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

function Login() {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const EXTENSION_ID = process.env.REACT_APP_EXTENSION_ID;

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            navigate("/dashboard");
        }
    }, [navigate]);

    async function sendTokenToExtension(token) {
        return new Promise((resolve, reject) => {
            if (!window.chrome?.runtime?.sendMessage) {
                return reject(new Error("Extension not available."));
            }

            if (!EXTENSION_ID) {
                console.warn("Extension ID not configured - skipping extension communication");
                return resolve();
            }

            chrome.runtime.sendMessage(
                EXTENSION_ID,
                { type: "SET_TOKEN", token },
                (response) => {
                    if (chrome.runtime.lastError || !response) {
                        console.warn("Extension communication failed:", chrome.runtime.lastError);
                        return resolve();
                    }
                    resolve(response);
                }
            );
        });
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/auth/login', {
                email,
                password
            });

            const token = res.data.token;
            localStorage.setItem('token', token);
            await sendTokenToExtension(token);
            navigate("/dashboard");
        } catch (err) {
            alert(err.message || "Login failed");
        }
    };


    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
                <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
                    Sign in to your account
                </h2>
                <form onSubmit={handleSubmit} className="space-y-5">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet"
                            placeholder="you@example.com"
                            onChange={(e) => setEmail(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                        <input
                            type="password"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet"
                            placeholder="••••••••"
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button
                        type="submit"
                        className="w-full py-2 bg-violet text-white font-semibold rounded-lg hover:bg-blue-violet transition"
                    >
                        Login
                    </button>
                </form>
                <p className="text-sm text-center text-gray-500 mt-6">
                    Don’t have an account? <a href="/register" className="text-violet hover:underline">Register</a>
                </p>
            </div>
        </div>
    );
}

export default Login;

