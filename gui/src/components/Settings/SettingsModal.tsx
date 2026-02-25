import React, { useState, ChangeEvent, FormEvent } from 'react';
import { X, Lock, Zap, FileText, AlertTriangle, Key } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Define the shape of the form data
interface SettingsFormData {
  // Inventory
  rssiThreshold: number;
  tagSeenCount: number;
  isTagSeenEnabled: boolean;
  reportTimestamp: boolean;
  
  // Reader
  antennas: {
    ant1: boolean; ant2: boolean; ant3: boolean; ant4: boolean;
    ant5: boolean; ant6: boolean; ant7: boolean; ant8: boolean;
  };

  // Advanced - Common
  accessPassword: string;
  
  // Advanced - Read/Write
  rwBank: string;
  rwOffset: number;
  rwLength: number;
  rwData: string;

  // Advanced - Lock
  lockBank: string;
  lockAction: string;

  // Advanced - Kill
  killPassword: string;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  // --- UI State (Not part of form data) ---
  const [activeTab, setActiveTab] = useState<'rw' | 'lock' | 'kill'>('rw');
  const [isSaving, setIsSaving] = useState(false);

  // --- Form Data State ---
  const [formData, setFormData] = useState<SettingsFormData>({
    rssiThreshold: -70,
    tagSeenCount: 5,
    isTagSeenEnabled: true,
    reportTimestamp: true,
    antennas: {
      ant1: true, ant2: true, ant3: true, ant4: false,
      ant5: false, ant6: false, ant7: false, ant8: false
    },
    accessPassword: '',
    rwBank: 'EPC',
    rwOffset: 0,
    rwLength: 2,
    rwData: '',
    lockBank: 'EPC Memory',
    lockAction: 'Unlock',
    killPassword: ''
  });

  if (!isOpen) return null;

  // --- Handlers ---

  // 1. Handle Generic Inputs (Text, Number, Select)
  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' || type === 'range' ? Number(value) : value
    }));
  };

  // 2. Handle Simple Checkboxes
  const handleCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: checked
    }));
  };

  // 3. Handle Nested Antenna Object
  const handleAntennaToggle = (key: keyof typeof formData.antennas) => {
    setFormData(prev => ({
      ...prev,
      antennas: {
        ...prev.antennas,
        [key]: !prev.antennas[key]
      }
    }));
  };

  // 4. Handle Form Submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); // Prevent page reload
    setIsSaving(true);
    
    console.log("Submitting Form Data:", formData);

    try {
      // @ts-ignore
      await window.electronAPI.saveSettings(formData);
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 500);
    } catch (error) {
      console.error("Failed to save settings", error);
      setIsSaving(false);
    }
  };

  // 5. Handle Specific Actions (Buttons that are NOT submit)
  const handleExecuteAction = (actionType: string) => {
    console.log(`Executing ${actionType} with data:`, formData);
    // Add logic here to trigger specific SDK commands immediately if needed
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center backdrop-blur-sm font-sans">
      <div className="bg-white rounded-lg shadow-2xl w-[900px] flex flex-col max-h-[95vh] overflow-hidden">
        
        {/* --- Header --- */}
        <div className="bg-gray-100 px-6 py-4 border-b border-gray-300 flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Settings Configuration</h2>
            <div className="mt-1 text-sm text-gray-600">
              <span className="font-semibold">Connection: </span> TCP/IP 192.168.1.100
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-800 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* --- START FORM --- */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          
          {/* --- Scrollable Body --- */}
          <div className="p-6 overflow-y-auto bg-gray-50 space-y-6 flex-1">

            {/* 1. TAG INVENTORY (Top Full Width) */}
            <div className="bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm">
              <div className="bg-gray-100 px-4 py-2 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wide">Tag Inventory Reporting</h3>
              </div>
              
              <div className="p-4 flex gap-8">
                {/* RSSI Slider */}
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <label htmlFor="rssiThreshold" className="text-sm font-medium text-gray-700">RSSI Threshold</label>
                    <span className="text-xs font-mono bg-gray-100 px-2 rounded">{formData.rssiThreshold} dBm</span>
                  </div>
                  <input 
                    id="rssiThreshold"
                    name="rssiThreshold"
                    type="range" min="-100" max="-10" 
                    value={formData.rssiThreshold}
                    onChange={handleInputChange}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                </div>

                {/* Tag Count */}
                <div className="flex items-center gap-4">
                    <div>
                      <label htmlFor="tagSeenCount" className="text-sm font-medium text-gray-700 block">Min. Seen Count</label>
                      <input 
                          id="tagSeenCount"
                          name="tagSeenCount"
                          type="number" 
                          value={formData.tagSeenCount}
                          onChange={handleInputChange}
                          className="w-20 mt-1 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-xs text-gray-500 mb-1">Filter</span>
                      <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            name="isTagSeenEnabled"
                            type="checkbox" 
                            checked={formData.isTagSeenEnabled} 
                            onChange={handleCheckboxChange} 
                            className="sr-only peer" 
                          />
                          <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                </div>
              </div>
            </div>

            {/* GRID LAYOUT FOR OPERATIONS & CONFIG */}
            <div className="grid grid-cols-12 gap-4">
              
              {/* 2. ADVANCED MEMORY & SECURITY (Left - Spans 7 cols) */}
              <div className="col-span-7 bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                      <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wide">Tag Memory & Security</h3>
                  </div>
                  
                  <div className="p-0 flex-1 flex flex-col">
                      {/* Access Password - Always Visible */}
                      <div className="p-4 border-b border-gray-100 bg-blue-50/30">
                          <label className="text-xs font-bold text-gray-600 block mb-1">ACCESS PASSWORD (Required for Write/Lock)</label>
                          <div className="flex items-center relative">
                              <Key className="absolute left-2 text-gray-400" size={14} />
                              <input 
                                  name="accessPassword"
                                  type="text" 
                                  placeholder="00000000 (Hex)"
                                  value={formData.accessPassword}
                                  onChange={handleInputChange}
                                  className="w-full pl-8 pr-3 py-1.5 text-sm font-mono border border-gray-300 rounded focus:border-blue-500 outline-none"
                              />
                          </div>
                      </div>

                      {/* Tabs (UI State Only) */}
                      <div className="flex border-b border-gray-200">
                          <button 
                              type="button"
                              onClick={() => setActiveTab('rw')}
                              className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 ${activeTab === 'rw' ? 'bg-white border-b-2 border-blue-600 text-blue-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                          >
                              <FileText size={14} /> Read / Write
                          </button>
                          <button 
                              type="button"
                              onClick={() => setActiveTab('lock')}
                              className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 ${activeTab === 'lock' ? 'bg-white border-b-2 border-orange-500 text-orange-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                          >
                              <Lock size={14} /> Lock
                          </button>
                          <button 
                              type="button"
                              onClick={() => setActiveTab('kill')}
                              className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 ${activeTab === 'kill' ? 'bg-white border-b-2 border-red-600 text-red-600' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}
                          >
                              <Zap size={14} /> Kill
                          </button>
                      </div>

                      {/* Tab Content */}
                      <div className="p-4 flex-1">
                          
                          {/* READ / WRITE TAB */}
                          {activeTab === 'rw' && (
                              <div className="space-y-4">
                                  <div className="grid grid-cols-3 gap-3">
                                      <div className="col-span-3">
                                          <label className="text-xs text-gray-500 block mb-1">Target Memory Bank</label>
                                          <select 
                                              name="rwBank"
                                              value={formData.rwBank} 
                                              onChange={handleInputChange}
                                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                          >
                                              <option value="EPC">EPC (Bank 1)</option>
                                              <option value="USER">User Memory (Bank 3)</option>
                                              <option value="TID">TID (Bank 2 - Read Only)</option>
                                              <option value="RESERVED">Reserved (Bank 0)</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="text-xs text-gray-500 block mb-1">Word Offset</label>
                                          <input 
                                            name="rwOffset"
                                            type="number" 
                                            value={formData.rwOffset} 
                                            onChange={handleInputChange} 
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm" 
                                          />
                                      </div>
                                      <div>
                                          <label className="text-xs text-gray-500 block mb-1">Word Length</label>
                                          <input 
                                            name="rwLength"
                                            type="number" 
                                            value={formData.rwLength} 
                                            onChange={handleInputChange} 
                                            className="w-full border border-gray-300 rounded px-2 py-1 text-sm" 
                                          />
                                      </div>
                                  </div>
                                  <div>
                                      <label className="text-xs text-gray-500 block mb-1">Data (Hex String) - Leave empty to Read</label>
                                      <textarea 
                                        name="rwData"
                                        value={formData.rwData}
                                        onChange={handleInputChange}
                                        className="w-full border border-gray-300 rounded px-2 py-2 text-sm font-mono h-20 resize-none" 
                                        placeholder="e.g. AABB1122..."
                                      ></textarea>
                                  </div>
                                  <button 
                                    type="button" 
                                    onClick={() => handleExecuteAction('RW_EXECUTE')}
                                    className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded"
                                  >
                                    Execute Read / Write
                                  </button>
                              </div>
                          )}

                          {/* LOCK TAB */}
                          {activeTab === 'lock' && (
                              <div className="space-y-4">
                                  <div className="bg-orange-50 p-3 rounded text-xs text-orange-800 border border-orange-200 flex items-start gap-2">
                                      <Lock size={16} className="shrink-0 mt-0.5" />
                                      <span>Locking memory prevents future writing. "PermaLock" cannot be undone.</span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                      <div>
                                          <label className="text-xs font-bold text-gray-700 block mb-1">Target Bank</label>
                                          <select 
                                              name="lockBank"
                                              value={formData.lockBank}
                                              onChange={handleInputChange}
                                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                          >
                                              <option value="EPC Memory">EPC Memory</option>
                                              <option value="User Memory">User Memory</option>
                                              <option value="Access Password">Access Password</option>
                                              <option value="Kill Password">Kill Password</option>
                                          </select>
                                      </div>
                                      <div>
                                          <label className="text-xs font-bold text-gray-700 block mb-1">Action</label>
                                          <select 
                                              name="lockAction"
                                              value={formData.lockAction} 
                                              onChange={handleInputChange}
                                              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm"
                                          >
                                              <option value="Unlock">Unlock (Accessible)</option>
                                              <option value="Lock">Lock (Pwd Required)</option>
                                              <option value="PermaLock">PermaLock (Forever)</option>
                                          </select>
                                      </div>
                                  </div>
                                  <button 
                                    type="button"
                                    onClick={() => handleExecuteAction('LOCK_EXECUTE')}
                                    className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded mt-4"
                                  >
                                    Apply Lock State
                                  </button>
                              </div>
                          )}

                          {/* KILL TAB */}
                          {activeTab === 'kill' && (
                              <div className="space-y-4">
                                  <div className="bg-red-50 p-3 rounded text-xs text-red-800 border border-red-200 flex items-start gap-2">
                                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                                      <span><strong>Warning:</strong> The Kill operation permanently disables the tag. It will never respond to any reader again. This cannot be reversed.</span>
                                  </div>
                                  <div>
                                      <label className="text-xs font-bold text-gray-700 block mb-1">KILL PASSWORD</label>
                                      <input 
                                          name="killPassword"
                                          type="password" 
                                          placeholder="Non-Zero Kill Password Required"
                                          value={formData.killPassword}
                                          onChange={handleInputChange}
                                          className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono"
                                      />
                                  </div>
                                  <button 
                                      type="button"
                                      onClick={() => handleExecuteAction('KILL_EXECUTE')}
                                      disabled={formData.killPassword.length === 0}
                                      className={`w-full py-2 text-white text-xs font-bold rounded mt-2 flex items-center justify-center gap-2 ${formData.killPassword.length > 0 ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-300 cursor-not-allowed'}`}
                                  >
                                      <Zap size={14} /> PERMANENTLY KILL TAG
                                  </button>
                              </div>
                          )}

                      </div>
                  </div>
              </div>

              {/* 3. READER CONFIGURATION (Right - Spans 5 cols) */}
              <div className="col-span-5 h-fit bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm flex flex-col">
                  <div className="bg-gray-100 px-4 py-2 border-b border-gray-200">
                      <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wide">Reader & Antenna</h3>
                  </div>
                  
                  <div className="p-4 space-y-6 flex-1"> 
                      {/* Antennas Grid */}
                      <div>
                          <div className="text-xs font-bold text-gray-700 mb-2">Active Antenna Ports</div>
                          <div className="grid grid-cols-4 gap-2">
                              {Object.keys(formData.antennas).map((ant) => (
                                  <label key={ant} className={`flex flex-col items-center justify-center p-2 rounded border cursor-pointer transition-all ${formData.antennas[ant as keyof typeof formData.antennas] ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-white border-gray-200 text-gray-400 hover:border-blue-300'}`}>
                                      <input 
                                          type="checkbox" 
                                          className="hidden"
                                          checked={formData.antennas[ant as keyof typeof formData.antennas]}
                                          onChange={() => handleAntennaToggle(ant as keyof typeof formData.antennas)}
                                      />
                                      <span className="text-xs font-bold uppercase">{ant.replace('ant', 'Ant ')}</span>
                                      <div className={`w-1.5 h-1.5 rounded-full mt-1 ${formData.antennas[ant as keyof typeof formData.antennas] ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                                  </label>
                              ))}
                          </div>
                      </div>

                      <div className="bg-gray-50 p-3 rounded text-xs text-gray-500 border border-gray-100">
                          <p><strong>Note:</strong> Ensure baud rate matches your hardware switch settings.</p>
                      </div>
                  </div>
              </div>

            </div>

          </div>

          {/* --- Footer --- */}
          <div className="bg-gray-100 px-6 py-4 border-t border-gray-300 flex justify-end gap-3">
            <button 
              type="button"
              onClick={onClose} 
              className="px-5 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 text-sm font-bold text-white bg-blue-700 hover:bg-blue-800 rounded shadow-sm transition-colors flex items-center gap-2"
            >
              {isSaving ? 'Applying...' : 'Apply Configuration'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}