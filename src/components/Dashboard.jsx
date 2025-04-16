import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';
import DatePicker from 'react-datepicker';
import MealCard from './MealCard';

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [meals, setMeals] = useState({});
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => {
    const loadMeals = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Simple one-time fetch instead of real-time listener
        const mealsDoc = await getDoc(doc(db, 'userMeals', user.uid));
        if (mealsDoc.exists()) {
          setMeals(mealsDoc.data() || {});
        } else {
          setMeals({});
        }
      } catch (error) {
        console.error('Error loading meals:', error);
        setError('Failed to load meals. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    loadMeals();
  }, [user]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  const getMealsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0];
    return meals[dateStr] || [];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Meal Dashboard</h1>
        <DatePicker
          selected={selectedDate}
          onChange={handleDateChange}
          className="border rounded p-2"
        />
      </div>

      {getMealsForDate(selectedDate).length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-500">No meals found for this date.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {getMealsForDate(selectedDate).map((meal) => (
            <MealCard key={meal.id} meal={meal} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard; 