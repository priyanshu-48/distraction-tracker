import './App.css'
import {Routes,Route} from "react-router-dom";
import Dashboard from './layout/Dashboard';
import Analytics from './pages/analytics';
import HomePage from './pages/HomePage';



function App() {
  return(
    <Routes>
      <Route path="/" element={<Dashboard />}>
        <Route path='/' element={<HomePage />} />
        <Route path='/analytics' element={<Analytics />} />
      </Route>
    </Routes>
  );
}

export default App
