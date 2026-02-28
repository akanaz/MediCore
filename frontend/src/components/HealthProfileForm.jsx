import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getHealthProfile, updateHealthProfile, deleteHealthProfile } from '../services/api';

const HealthProfileForm = ({ onClose }) => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState({
    age: '', sex: '', height_cm: '', weight_kg: '', blood_type: '',
    known_conditions: '', current_medications: '', allergies: '',
    family_history: '', smoking: '', alcohol: '', exercise: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success');

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const data = await getHealthProfile();
      setProfile({
        age: data.age || '',
        sex: data.sex || '',
        height_cm: data.height_cm || '',
        weight_kg: data.weight_kg || '',
        blood_type: data.blood_type || '',
        known_conditions: (data.known_conditions || []).join(', '),
        current_medications: (data.current_medications || []).join(', '),
        allergies: (data.allergies || []).join(', '),
        family_history: (data.family_history || []).join(', '),
        smoking: data.smoking || '',
        alcohol: data.alcohol || '',
        exercise: data.exercise || '',
      });
    } catch {
      // Profile may not exist yet
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage('');
      const profileData = {
        age: profile.age ? parseInt(profile.age) : null,
        sex: profile.sex || null,
        height_cm: profile.height_cm ? parseFloat(profile.height_cm) : null,
        weight_kg: profile.weight_kg ? parseFloat(profile.weight_kg) : null,
        blood_type: profile.blood_type || null,
        known_conditions: profile.known_conditions ? profile.known_conditions.split(',').map(s => s.trim()).filter(Boolean) : [],
        current_medications: profile.current_medications ? profile.current_medications.split(',').map(s => s.trim()).filter(Boolean) : [],
        allergies: profile.allergies ? profile.allergies.split(',').map(s => s.trim()).filter(Boolean) : [],
        family_history: profile.family_history ? profile.family_history.split(',').map(s => s.trim()).filter(Boolean) : [],
        smoking: profile.smoking || null,
        alcohol: profile.alcohol || null,
        exercise: profile.exercise || null,
      };
      await updateHealthProfile(profileData);
      setMessageType('success');
      setMessage(t('profile.savedSuccess'));
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessageType('error');
      setMessage(t('profile.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(t('profile.deleteConfirm'))) return;
    try {
      await deleteHealthProfile();
      setProfile({ age: '', sex: '', height_cm: '', weight_kg: '', blood_type: '', known_conditions: '', current_medications: '', allergies: '', family_history: '', smoking: '', alcohol: '', exercise: '' });
      setMessageType('success');
      setMessage(t('profile.deleted'));
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessageType('error');
      setMessage(t('profile.deleteError'));
    }
  };

  const handleChange = (field, value) => setProfile(prev => ({ ...prev, [field]: value }));

  if (loading) {
    return (
      <div className="health-profile-overlay">
        <div className="health-profile-form">
          <p>{t('profile.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="health-profile-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="health-profile-form">
        <div className="profile-header">
          <h2>{t('profile.title')}</h2>
          <button onClick={onClose} className="close-btn" aria-label={t('profile.close')}>&times;</button>
        </div>
        <p className="profile-subtitle">{t('profile.subtitle')}</p>

        <div className="profile-grid">
          <div className="profile-field">
            <label>{t('profile.age')}</label>
            <input type="number" value={profile.age} onChange={(e) => handleChange('age', e.target.value)} placeholder={t('profile.agePlaceholder')} min="0" max="150" />
          </div>

          <div className="profile-field">
            <label>{t('profile.sex')}</label>
            <select value={profile.sex} onChange={(e) => handleChange('sex', e.target.value)}>
              <option value="">{t('profile.select')}</option>
              <option value="male">{t('profile.male')}</option>
              <option value="female">{t('profile.female')}</option>
              <option value="other">{t('profile.other')}</option>
            </select>
          </div>

          <div className="profile-field">
            <label>{t('profile.height')}</label>
            <input type="number" value={profile.height_cm} onChange={(e) => handleChange('height_cm', e.target.value)} placeholder={t('profile.heightPlaceholder')} />
          </div>

          <div className="profile-field">
            <label>{t('profile.weight')}</label>
            <input type="number" value={profile.weight_kg} onChange={(e) => handleChange('weight_kg', e.target.value)} placeholder={t('profile.weightPlaceholder')} />
          </div>

          <div className="profile-field">
            <label>{t('profile.bloodType')}</label>
            <select value={profile.blood_type} onChange={(e) => handleChange('blood_type', e.target.value)}>
              <option value="">{t('profile.select')}</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </select>
          </div>

          <div className="profile-field">
            <label>{t('profile.smoking')}</label>
            <select value={profile.smoking} onChange={(e) => handleChange('smoking', e.target.value)}>
              <option value="">{t('profile.select')}</option>
              <option value="never">{t('profile.never')}</option>
              <option value="former">{t('profile.former')}</option>
              <option value="current">{t('profile.current')}</option>
            </select>
          </div>

          <div className="profile-field">
            <label>{t('profile.alcohol')}</label>
            <select value={profile.alcohol} onChange={(e) => handleChange('alcohol', e.target.value)}>
              <option value="">{t('profile.select')}</option>
              <option value="none">{t('profile.none')}</option>
              <option value="moderate">{t('profile.moderate')}</option>
              <option value="heavy">{t('profile.heavy')}</option>
            </select>
          </div>

          <div className="profile-field">
            <label>{t('profile.exercise')}</label>
            <select value={profile.exercise} onChange={(e) => handleChange('exercise', e.target.value)}>
              <option value="">{t('profile.select')}</option>
              <option value="sedentary">{t('profile.sedentary')}</option>
              <option value="moderate">{t('profile.moderate')}</option>
              <option value="active">{t('profile.active')}</option>
            </select>
          </div>
        </div>

        <div className="profile-field full-width">
          <label>{t('profile.conditions')}</label>
          <input type="text" value={profile.known_conditions} onChange={(e) => handleChange('known_conditions', e.target.value)} placeholder={t('profile.conditionsPlaceholder')} />
        </div>

        <div className="profile-field full-width">
          <label>{t('profile.medications')}</label>
          <input type="text" value={profile.current_medications} onChange={(e) => handleChange('current_medications', e.target.value)} placeholder={t('profile.medicationsPlaceholder')} />
        </div>

        <div className="profile-field full-width">
          <label>{t('profile.allergies')}</label>
          <input type="text" value={profile.allergies} onChange={(e) => handleChange('allergies', e.target.value)} placeholder={t('profile.allergiesPlaceholder')} />
        </div>

        <div className="profile-field full-width">
          <label>{t('profile.familyHistory')}</label>
          <input type="text" value={profile.family_history} onChange={(e) => handleChange('family_history', e.target.value)} placeholder={t('profile.familyHistoryPlaceholder')} />
        </div>

        {message && (
          <div className={`profile-message ${messageType}`}>
            {message}
          </div>
        )}

        <div className="profile-actions">
          <button onClick={handleSave} disabled={saving} className="save-btn">
            {saving ? t('profile.saving') : t('profile.save')}
          </button>
          <button onClick={handleDelete} className="delete-btn">
            {t('profile.delete')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default HealthProfileForm;
