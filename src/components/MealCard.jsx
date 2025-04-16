import React, { useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { doc, writeBatch, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase/config';
import Progress from './Progress';

const MealCard = ({ meal, date }) => {
  const { user } = useAuth();
  const progressRef = useRef(null);

  const handleDelete = async () => {
    if (!user) return;

    try {
      const batch = writeBatch(db);
      
      // Delete from meals collection
      const mealsRef = doc(db, 'userMeals', user.uid);
      batch.update(mealsRef, {
        [`${date}.meals`]: arrayRemove(meal)
      });

      // Reset progress when meal is deleted
      if (progressRef.current && progressRef.current.handleMealDeleted) {
        progressRef.current.handleMealDeleted();
      }

      // Commit all changes in one batch
      await batch.commit();
    } catch (error) {
      console.error('Error deleting meal:', error);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            {meal.imageUrl && (
              <img 
                src={meal.imageUrl} 
                alt={meal.name}
                className="w-full h-64 object-cover rounded-lg mb-4"
              />
            )}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold mb-2">Detected Foods:</h3>
                <p className="text-gray-600">{meal.detectedFoods?.join(', ')}</p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Total Nutrition:</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-gray-600">Calories</p>
                    <p className="font-semibold">{meal.nutrients.calories}</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Protein</p>
                    <p className="font-semibold">{meal.nutrients.protein}g</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Carbs</p>
                    <p className="font-semibold">{meal.nutrients.carbs}g</p>
                  </div>
                  <div>
                    <p className="text-gray-600">Fats</p>
                    <p className="font-semibold">{meal.nutrients.fat}g</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={handleDelete}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <Progress
          ref={progressRef}
          date={date}
          mealType={meal.type}
          nutrients={meal.nutrients}
        />
      </div>
    </div>
  );
};

export default MealCard; 