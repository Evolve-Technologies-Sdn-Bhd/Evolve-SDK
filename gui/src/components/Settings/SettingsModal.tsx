import React, { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  // Form State
  const [power, setPower] = useState(30); // dBm
  const [region, setRegion] = useState('FCC');
  const [beeper, setBeeper] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // @ts-ignore
      await window.electronAPI.saveSettings({ power, region, beeper });
      // Simulate a small delay for UX
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error("Failed to save settings", error);
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-[500px] flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gray-100 px-4 py-3 border-b border-gray-300 flex justify-between items-center rounded-t-lg">
          <h2 className="text-sm font-bold text-gray-800">Setting Configurations</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-red-600 font-bold">✕</button>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
          
          {/* RF Power Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wide">RF Power Configuration</h3>
            <div className="bg-gray-50 border border-gray-200 p-4 rounded text-sm">
              <div className="flex justify-between mb-2">
                <label className="font-medium text-gray-700">Antenna Power (dBm)</label>
                <span className="font-mono font-bold text-blue-600">{power} dBm</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="33" 
                value={power} 
                onChange={(e) => setPower(Number(e.target.value))}
                className="w-full h-2 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <p className="text-[10px] text-gray-500 mt-1">
                Higher power increases range but consumes more energy. Max: 33dBm.
              </p>
            </div>
          </div>

          {/* Region / Channel Section */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wide">Frequency Region</h3>
            <div className="bg-gray-50 border border-gray-200 p-4 rounded text-sm space-y-3">
              <div>
                <label className="block font-medium text-gray-700 mb-1">Regulatory Region</label>
                <select 
                  value={region} 
                  onChange={(e) => setRegion(e.target.value)}
                  className="w-full border border-gray-300 rounded p-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="FCC">FCC (North America) - 902-928 MHz</option>
                  <option value="ETSI">ETSI (Europe) - 865-868 MHz</option>
                  <option value="CHN">CHN (China) - 920-925 MHz</option>
                </select>
              </div>
            </div>
          </div>

          {/* Misc Settings */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-blue-600 uppercase tracking-wide">Device Feedback</h3>
            <div className="bg-gray-50 border border-gray-200 p-4 rounded text-sm flex items-center justify-between">
              <label className="font-medium text-gray-700">Beep on Read</label>
              <div className="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
                <input 
                  type="checkbox" 
                  name="toggle" 
                  id="toggle" 
                  checked={beeper}
                  onChange={() => setBeeper(!beeper)}
                  className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 right-5"
                />
                <label htmlFor="toggle" className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${beeper ? 'bg-blue-600' : 'bg-gray-300'}`}></label>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-gray-100 px-4 py-3 border-t border-gray-300 flex justify-end gap-3 rounded-b-lg">
          <button 
            onClick={onClose} 
            className="px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            disabled={isSaving}
            className="px-6 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors flex items-center gap-2"
          >
            {isSaving ? 'Saving...' : 'Apply Settings'}
          </button>
        </div>

      </div>
    </div>
  );
}