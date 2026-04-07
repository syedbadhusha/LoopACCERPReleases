import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { installApiBaseUrlInterceptor } from './config/runtime.ts'

installApiBaseUrlInterceptor()

createRoot(document.getElementById("root")!).render(<App />);
