import { Routes, Route } from 'react-router-dom';
import Pill from './components/Pill';
import HistoryView from './components/HistoryView';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HistoryView />} />
      <Route path="/history" element={<HistoryView />} />
      <Route path="/pill" element={<Pill />} />
      <Route path="*" element={<HistoryView />} />
    </Routes>
  );
}

export default App;
