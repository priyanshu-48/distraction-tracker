import './App.css'
import {Routes,Route} from "react-router-dom";
import Dashboard from './layout/Dashboard';
import Analytics from './pages/analytics';
import Home from './pages/Home';



function App() {
  return(
    <Routes>
      <Route path="/" element={<Dashboard />}>
        <Route path='/' element={<Home />} />
        <Route path='/analytics' element={<Analytics />} />
      </Route>
    </Routes>
  );
}

export default App
