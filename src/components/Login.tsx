import React, { useState } from 'react';

interface LoginProps {
    onLogin: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const correctPassword = import.meta.env.VITE_APP_PASSWORD;

        if (password === correctPassword) {
            localStorage.setItem('isAuthenticated', 'true');
            onLogin();
        } else {
            setError('Incorrect password. Please try again.');
            setPassword('');
        }
    };

    return (
        <div className="h-screen w-screen bg-[#050505] flex items-center justify-center font-sans">
            <div className="w-full max-w-md p-8">
                <div className="bg-[#0a0a0a] border border-white/[0.05] rounded-lg p-8 shadow-xl">
                    <div className="mb-8 text-center">
                        <h1 className="text-2xl font-bold text-white mb-2">Video Editor</h1>
                        <p className="text-gray-400 text-sm">Enter password to access</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                id="password"
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    setError('');
                                }}
                                className="w-full px-4 py-3 bg-[#1a1a1a] border border-white/[0.1] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#26c6da] focus:ring-1 focus:ring-[#26c6da] transition-colors"
                                placeholder="Enter password"
                                autoFocus
                            />
                            {error && (
                                <p className="mt-2 text-sm text-red-400">{error}</p>
                            )}
                        </div>

                        <button
                            type="submit"
                            className="w-full py-3 px-4 bg-[#26c6da] hover:bg-[#1fb5c7] text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[#26c6da] focus:ring-offset-2 focus:ring-offset-[#0a0a0a]"
                        >
                            Access Editor
                        </button>
                    </form>
                </div>

                <p className="text-center text-gray-500 text-xs mt-6">
                    Protected access • Authorized users only
                </p>
            </div>
        </div>
    );
};
