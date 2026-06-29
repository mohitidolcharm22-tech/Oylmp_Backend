/**
 * Seed script — populates MongoDB with initial subjects, topics, lessons and quizzes
 * Run: node src/scripts/seed.js
 */
require('dotenv').config()
const mongoose = require('mongoose')
const Subject  = require('../models/Subject')
const Topic    = require('../models/Topic')
const Lesson   = require('../models/Lesson')
const Quiz     = require('../models/Quiz')
const User     = require('../models/User')

const connectDB = require('../config/db')

/* ─── Subjects ─────────────────────────────────────────────────────────────── */
const subjectsData = [
  {
    name: 'Mathematics', icon: '🔢', color: '#6C63FF',
    bgGradient: 'linear-gradient(135deg, #6C63FF 0%, #A78BFA 100%)',
    description: 'Numbers, shapes, and logical thinking',
    grades: ['nursery', '1', '2', '3', '4', '5'], order: 1,
  },
  {
    name: 'English', icon: '📚', color: '#10B981',
    bgGradient: 'linear-gradient(135deg, #10B981 0%, #34D399 100%)',
    description: 'Reading, writing, grammar, and vocabulary',
    grades: ['nursery', '1', '2', '3', '4', '5'], order: 2,
  },
  {
    name: 'General Knowledge', icon: '🌍', color: '#F59E0B',
    bgGradient: 'linear-gradient(135deg, #F59E0B 0%, #FCD34D 100%)',
    description: 'Science, history, geography, and world awareness',
    grades: ['nursery', '1', '2', '3', '4', '5'], order: 3,
  },
]

/* ─── Topics (defined after subjects so we can reference _ids) ─────────────── */
const topicsData = (subjectMap) => [
  // MATHEMATICS
  { subjectId: subjectMap['Mathematics'], name: 'Counting & Numbers',  icon: '1️⃣', grade: ['nursery','1'], order: 1, difficulty: 'easy' },
  { subjectId: subjectMap['Mathematics'], name: 'Addition',            icon: '➕', grade: ['1','2'],       order: 2, difficulty: 'easy' },
  { subjectId: subjectMap['Mathematics'], name: 'Subtraction',         icon: '➖', grade: ['1','2'],       order: 3, difficulty: 'easy' },
  { subjectId: subjectMap['Mathematics'], name: 'Multiplication',      icon: '✖️', grade: ['2','3'],       order: 4, difficulty: 'medium' },
  { subjectId: subjectMap['Mathematics'], name: 'Division',            icon: '➗', grade: ['3','4'],       order: 5, difficulty: 'medium' },
  { subjectId: subjectMap['Mathematics'], name: 'Shapes & Geometry',   icon: '🔷', grade: ['1','2','3'],   order: 6, difficulty: 'easy' },
  { subjectId: subjectMap['Mathematics'], name: 'Fractions',           icon: '🍕', grade: ['3','4'],       order: 7, difficulty: 'medium' },
  { subjectId: subjectMap['Mathematics'], name: 'Measurement',         icon: '📏', grade: ['2','3','4'],   order: 8, difficulty: 'medium' },
  { subjectId: subjectMap['Mathematics'], name: 'Time & Calendar',     icon: '🕐', grade: ['2','3'],       order: 9, difficulty: 'easy' },
  { subjectId: subjectMap['Mathematics'], name: 'Patterns & Sequences',icon: '🔄', grade: ['4','5'],       order: 10, difficulty: 'hard' },
  // ENGLISH
  { subjectId: subjectMap['English'], name: 'Alphabet & Phonics',     icon: '🔤', grade: ['nursery','1'], order: 1, difficulty: 'easy' },
  { subjectId: subjectMap['English'], name: 'Sight Words',            icon: '👀', grade: ['1','2'],       order: 2, difficulty: 'easy' },
  { subjectId: subjectMap['English'], name: 'Nouns & Pronouns',       icon: '📝', grade: ['2','3'],       order: 3, difficulty: 'medium' },
  { subjectId: subjectMap['English'], name: 'Verbs & Tenses',         icon: '🏃', grade: ['3','4'],       order: 4, difficulty: 'medium' },
  { subjectId: subjectMap['English'], name: 'Adjectives',             icon: '🌈', grade: ['2','3'],       order: 5, difficulty: 'easy' },
  { subjectId: subjectMap['English'], name: 'Reading Comprehension',  icon: '📖', grade: ['3','4','5'],   order: 6, difficulty: 'hard' },
  { subjectId: subjectMap['English'], name: 'Creative Writing',       icon: '✍️', grade: ['4','5'],       order: 7, difficulty: 'hard' },
  { subjectId: subjectMap['English'], name: 'Vocabulary Building',    icon: '📚', grade: ['2','3','4'],   order: 8, difficulty: 'medium' },
  // GENERAL KNOWLEDGE
  { subjectId: subjectMap['General Knowledge'], name: 'Animals & Plants',    icon: '🦁', grade: ['nursery','1','2'], order: 1, difficulty: 'easy' },
  { subjectId: subjectMap['General Knowledge'], name: 'Human Body',          icon: '🫁', grade: ['2','3'],           order: 2, difficulty: 'easy' },
  { subjectId: subjectMap['General Knowledge'], name: 'Food & Nutrition',    icon: '🥗', grade: ['1','2'],           order: 3, difficulty: 'easy' },
  { subjectId: subjectMap['General Knowledge'], name: 'Our Country India',   icon: '🇮🇳', grade: ['2','3','4'],       order: 4, difficulty: 'medium' },
  { subjectId: subjectMap['General Knowledge'], name: 'Space & Universe',    icon: '🪐', grade: ['3','4','5'],       order: 5, difficulty: 'medium' },
  { subjectId: subjectMap['General Knowledge'], name: 'Environment & Nature',icon: '🌿', grade: ['2','3'],           order: 6, difficulty: 'easy' },
  { subjectId: subjectMap['General Knowledge'], name: 'Sports & Games',      icon: '⚽', grade: ['1','2','3'],       order: 7, difficulty: 'easy' },
  { subjectId: subjectMap['General Knowledge'], name: 'Festivals & Culture', icon: '🎉', grade: ['2','3','4'],       order: 8, difficulty: 'medium' },
]

/* ─── Lessons ──────────────────────────────────────────────────────────────── */
const lessonsData = (topicMap, subjectMap) => [
  // MATHEMATICS - Counting & Numbers
  { topicId: topicMap['Counting & Numbers'], subjectId: subjectMap['Mathematics'], order: 1, title: 'Counting 1 to 10', duration: 10, content: "Let's learn to count from 1 to 10! Each number has a name and a symbol. 1 is ONE 🐱, 2 is TWO 🐱🐱, 3 is THREE 🐱🐱🐱...", keyPoints: ['1 to 5 counting', '6 to 10 counting', 'Writing numbers'], xp: 50 },
  { topicId: topicMap['Counting & Numbers'], subjectId: subjectMap['Mathematics'], order: 2, title: 'Counting 11 to 20', duration: 12, content: "Now let's explore numbers from 11 to 20! After 10 comes 11, then 12...", keyPoints: ['Teen numbers 11-19', 'The number 20', 'Counting objects'], xp: 60 },
  { topicId: topicMap['Counting & Numbers'], subjectId: subjectMap['Mathematics'], order: 3, title: 'Comparing Numbers', duration: 15, content: "We can compare numbers using greater than (>), less than (<), and equal to (=).", keyPoints: ['Greater than', 'Less than', 'Equal to'], xp: 70 },
  // MATHEMATICS - Addition
  { topicId: topicMap['Addition'], subjectId: subjectMap['Mathematics'], order: 1, title: 'What is Addition?', duration: 10, content: "Addition means putting things together! If you have 2 apples 🍎🍎 and add 3 more 🍎🍎🍎, you get 5 apples!", keyPoints: ['Plus sign (+)', 'Adding small numbers', 'Sum = total'], xp: 50 },
  { topicId: topicMap['Addition'], subjectId: subjectMap['Mathematics'], order: 2, title: 'Adding Single Digits', duration: 15, content: "Let's practice adding single digit numbers. Use your fingers to help!", keyPoints: ['Adding 1-5', 'Adding 6-9', 'Mental math tips'], xp: 60 },
  { topicId: topicMap['Addition'], subjectId: subjectMap['Mathematics'], order: 3, title: 'Adding Two-Digit Numbers', duration: 20, content: "Now we'll add bigger numbers! We add the ones column first, then the tens column.", keyPoints: ['Ones and tens place', 'Column addition', 'Carrying over'], xp: 80 },
  // MATHEMATICS - Multiplication
  { topicId: topicMap['Multiplication'], subjectId: subjectMap['Mathematics'], order: 1, title: 'Introduction to Multiplication', duration: 15, content: "Multiplication is repeated addition! 3 × 4 means adding 3 four times: 3+3+3+3 = 12", keyPoints: ['Times sign (×)', 'Multiplication as addition', 'Groups of objects'], xp: 70 },
  { topicId: topicMap['Multiplication'], subjectId: subjectMap['Mathematics'], order: 2, title: 'Multiplication Tables 1-5', duration: 20, content: "Let's memorize the multiplication tables! Tables 1 through 5 are the building blocks.", keyPoints: ['Table of 1, 2, 3', 'Table of 4, 5', 'Tips to memorize'], xp: 90 },
  { topicId: topicMap['Multiplication'], subjectId: subjectMap['Mathematics'], order: 3, title: 'Multiplication Tables 6-10', duration: 20, content: "Tables 6 to 10! These can be trickier, but with practice you'll master them!", keyPoints: ['Table of 6, 7, 8', 'Table of 9, 10', 'Fun tricks for 9s'], xp: 100 },
  // ENGLISH - Alphabet & Phonics
  { topicId: topicMap['Alphabet & Phonics'], subjectId: subjectMap['English'], order: 1, title: 'A, B, C - The Alphabet Song', duration: 10, content: "The English alphabet has 26 letters. Let's start with A, B, C! A is for Apple 🍎, B is for Ball ⚽, C is for Cat 🐱", keyPoints: ['26 letters', 'A to M', 'Letter sounds'], xp: 50 },
  { topicId: topicMap['Alphabet & Phonics'], subjectId: subjectMap['English'], order: 2, title: 'N to Z - Completing the Alphabet', duration: 10, content: "Now the second half! N is for Nest 🐦, O is for Orange 🍊, P is for Parrot 🦜...", keyPoints: ['N to Z', 'Letter sounds', 'Uppercase and lowercase'], xp: 50 },
  { topicId: topicMap['Alphabet & Phonics'], subjectId: subjectMap['English'], order: 3, title: 'Vowels and Consonants', duration: 15, content: "Letters are divided into vowels (A, E, I, O, U) and consonants (all others). Vowels make the main sounds in words!", keyPoints: ['5 vowels', '21 consonants', 'Vowel sounds'], xp: 70 },
  // ENGLISH - Nouns & Pronouns
  { topicId: topicMap['Nouns & Pronouns'], subjectId: subjectMap['English'], order: 1, title: 'What are Nouns?', duration: 12, content: "A noun is a naming word! It names a person, place, animal, or thing. Examples: boy, school, dog, book.", keyPoints: ['Person nouns', 'Place nouns', 'Thing nouns'], xp: 60 },
  { topicId: topicMap['Nouns & Pronouns'], subjectId: subjectMap['English'], order: 2, title: 'Common vs Proper Nouns', duration: 15, content: "Common nouns are general (city, boy). Proper nouns are specific names (Mumbai, Arjun) and start with capitals!", keyPoints: ['Common nouns', 'Proper nouns', 'Capitalization'], xp: 70 },
  { topicId: topicMap['Nouns & Pronouns'], subjectId: subjectMap['English'], order: 3, title: 'Pronouns - He, She, It, They', duration: 12, content: "Pronouns replace nouns! Instead of saying 'Arjun went to school', we say 'He went to school'.", keyPoints: ['I, You, He, She', 'It, We, They', 'Using pronouns correctly'], xp: 70 },
  // GK - Animals & Plants
  { topicId: topicMap['Animals & Plants'], subjectId: subjectMap['General Knowledge'], order: 1, title: 'Wild Animals', duration: 15, content: "Wild animals live in forests, jungles, and savannas. The lion is the King of the Jungle! 🦁 Tigers, elephants, and giraffes are all wild animals.", keyPoints: ['Animals of jungle', 'Animals of safari', 'Habitats'], xp: 60 },
  { topicId: topicMap['Animals & Plants'], subjectId: subjectMap['General Knowledge'], order: 2, title: 'Domestic Animals', duration: 12, content: "Domestic animals live with humans! Dogs 🐕, cats 🐱, cows 🐄, and horses 🐴 are domestic animals. They help us or are our pets.", keyPoints: ['Pet animals', 'Farm animals', 'Animal products'], xp: 55 },
  { topicId: topicMap['Animals & Plants'], subjectId: subjectMap['General Knowledge'], order: 3, title: 'Plants Around Us', duration: 12, content: "Plants are living things that make their own food using sunlight! 🌿 Trees, flowers, grass, and shrubs are all plants. They give us oxygen to breathe!", keyPoints: ['Parts of a plant', 'Photosynthesis basics', 'Types of plants'], xp: 60 },
  // GK - Our Country India
  { topicId: topicMap['Our Country India'], subjectId: subjectMap['General Knowledge'], order: 1, title: 'India - Our Motherland', duration: 15, content: "India is a beautiful country in South Asia 🇮🇳. It is the 7th largest country in the world and has a rich history going back thousands of years!", keyPoints: ['Location of India', 'Capital: New Delhi', 'National symbols'], xp: 70 },
  { topicId: topicMap['Our Country India'], subjectId: subjectMap['General Knowledge'], order: 2, title: 'States and Languages', duration: 18, content: "India has 28 states and 8 union territories! People speak many languages - Hindi, Tamil, Bengali, Marathi, and more. Unity in diversity!", keyPoints: ['28 states', 'Major languages', 'State capitals'], xp: 80 },
  { topicId: topicMap['Our Country India'], subjectId: subjectMap['General Knowledge'], order: 3, title: 'National Symbols of India', duration: 12, content: "India has many national symbols! National Bird: Peacock 🦚, National Animal: Tiger 🐅, National Flower: Lotus 🪷, National Fruit: Mango 🥭", keyPoints: ['National bird, animal', 'National flower, fruit', 'National flag colors'], xp: 65 },
]

/* ─── Quizzes ──────────────────────────────────────────────────────────────── */
const quizzesData = (topicMap, subjectMap) => [
  {
    topicId: topicMap['Counting & Numbers'], subjectId: subjectMap['Mathematics'],
    title: 'Counting Fun!', description: 'Test your counting skills from 1 to 20!',
    difficulty: 'easy', grade: '1', durationMinutes: 5, passingScore: 60, xpReward: 100, icon: '1️⃣',
    questions: [
      { text: 'How many apples? 🍎🍎🍎', type: 'mcq', options: ['2', '3', '4', '5'], correctAnswer: '3', explanation: 'Count carefully: 1, 2, 3 apples!', points: 20 },
      { text: 'What number comes after 9?', type: 'mcq', options: ['8', '10', '11', '7'], correctAnswer: '10', explanation: '9, then 10! We reach double digits.', points: 20 },
      { text: 'Which is the biggest number?', type: 'mcq', options: ['5', '12', '8', '19'], correctAnswer: '19', explanation: '19 is the biggest among these numbers!', points: 20 },
      { text: 'How many fingers on 2 hands?', type: 'mcq', options: ['8', '9', '10', '12'], correctAnswer: '10', explanation: '5 fingers on each hand = 5 + 5 = 10!', points: 20 },
      { text: 'What number comes before 15?', type: 'mcq', options: ['13', '14', '16', '17'], correctAnswer: '14', explanation: '...13, 14, 15! 14 comes before 15.', points: 20 },
    ],
  },
  {
    topicId: topicMap['Addition'], subjectId: subjectMap['Mathematics'],
    title: 'Addition Adventure', description: 'Can you add these numbers correctly?',
    difficulty: 'easy', grade: '2', durationMinutes: 8, passingScore: 60, xpReward: 120, icon: '➕',
    questions: [
      { text: '3 + 4 = ?', type: 'mcq', options: ['6', '7', '8', '5'], correctAnswer: '7', explanation: '3 + 4 = 7. Count on from 3: 4, 5, 6, 7!', points: 20 },
      { text: '5 + 6 = ?', type: 'mcq', options: ['10', '11', '12', '9'], correctAnswer: '11', explanation: '5 + 6 = 11. Remember: 5 + 5 = 10, then add 1 more!', points: 20 },
      { text: 'What is 12 + 7?', type: 'mcq', options: ['17', '18', '19', '20'], correctAnswer: '19', explanation: '12 + 7 = 19.', points: 20 },
      { text: 'A basket has 8 oranges. We add 5 more. How many now?', type: 'mcq', options: ['11', '12', '13', '14'], correctAnswer: '13', explanation: '8 + 5 = 13 oranges!', points: 20 },
      { text: '25 + 10 = ?', type: 'mcq', options: ['30', '34', '35', '36'], correctAnswer: '35', explanation: '25 + 10 = 35.', points: 20 },
    ],
  },
  {
    topicId: topicMap['Multiplication'], subjectId: subjectMap['Mathematics'],
    title: 'Multiplication Master', description: 'Test your multiplication tables knowledge!',
    difficulty: 'medium', grade: '3', durationMinutes: 10, passingScore: 60, xpReward: 150, icon: '✖️',
    questions: [
      { text: '3 × 4 = ?', type: 'mcq', options: ['7', '10', '12', '14'], correctAnswer: '12', explanation: '3 × 4 = 12. Three groups of 4: 4+4+4 = 12!', points: 20 },
      { text: '6 × 7 = ?', type: 'mcq', options: ['42', '44', '46', '48'], correctAnswer: '42', explanation: '6 × 7 = 42.', points: 20 },
      { text: '5 × 8 = ?', type: 'mcq', options: ['35', '38', '40', '45'], correctAnswer: '40', explanation: '5 × 8 = 40.', points: 20 },
      { text: '9 × 3 = ?', type: 'mcq', options: ['24', '27', '28', '30'], correctAnswer: '27', explanation: '9 × 3 = 27.', points: 20 },
      { text: 'A box has 6 rows with 4 items each. Total items?', type: 'mcq', options: ['20', '22', '24', '26'], correctAnswer: '24', explanation: '6 × 4 = 24 items!', points: 20 },
    ],
  },
  {
    topicId: topicMap['Alphabet & Phonics'], subjectId: subjectMap['English'],
    title: 'Alphabet & Phonics Quiz', description: 'How well do you know your ABCs?',
    difficulty: 'easy', grade: '1', durationMinutes: 5, passingScore: 60, xpReward: 100, icon: '🔤',
    questions: [
      { text: 'Which letter comes after "D"?', type: 'mcq', options: ['C', 'E', 'F', 'B'], correctAnswer: 'E', explanation: 'A, B, C, D, E! E comes after D.', points: 20 },
      { text: 'Which of these is a VOWEL?', type: 'mcq', options: ['B', 'T', 'O', 'P'], correctAnswer: 'O', explanation: 'The vowels are A, E, I, O, U. O is a vowel!', points: 20 },
      { text: 'How many vowels are in the English alphabet?', type: 'mcq', options: ['3', '4', '5', '6'], correctAnswer: '5', explanation: 'There are 5 vowels: A, E, I, O, U!', points: 20 },
      { text: 'Which letter is the LAST in the alphabet?', type: 'mcq', options: ['X', 'Y', 'Z', 'W'], correctAnswer: 'Z', explanation: 'Z is the last letter!', points: 20 },
      { text: '"B" sounds like ____ at the start of "Ball"?', type: 'mcq', options: ['"buh"', '"puh"', '"duh"', '"kuh"'], correctAnswer: '"buh"', explanation: 'B makes the "buh" sound!', points: 20 },
    ],
  },
  {
    topicId: topicMap['Nouns & Pronouns'], subjectId: subjectMap['English'],
    title: 'Nouns & Pronouns Challenge', description: 'Identify nouns and use pronouns correctly!',
    difficulty: 'medium', grade: '3', durationMinutes: 8, passingScore: 60, xpReward: 130, icon: '📝',
    questions: [
      { text: 'Which word is a NOUN? "The happy dog runs fast."', type: 'mcq', options: ['happy', 'runs', 'dog', 'fast'], correctAnswer: 'dog', explanation: '"Dog" is a noun!', points: 20 },
      { text: '"Mumbai" is a ________ noun.', type: 'mcq', options: ['Common', 'Proper', 'Plural', 'Abstract'], correctAnswer: 'Proper', explanation: 'Mumbai is a Proper noun!', points: 20 },
      { text: 'Replace "Arjun" with the correct pronoun.', type: 'mcq', options: ['She', 'They', 'He', 'It'], correctAnswer: 'He', explanation: 'Arjun is a boy — use "He"!', points: 20 },
      { text: 'Which is a COMMON noun?', type: 'mcq', options: ['India', 'Taj Mahal', 'River', 'Ganges'], correctAnswer: 'River', explanation: '"River" is a common noun!', points: 20 },
      { text: '"___ are my best friends." (two girls)', type: 'mcq', options: ['He', 'She', 'They', 'It'], correctAnswer: 'They', explanation: '"They" is used for more than one person!', points: 20 },
    ],
  },
  {
    topicId: topicMap['Animals & Plants'], subjectId: subjectMap['General Knowledge'],
    title: 'Amazing Animals Quiz', description: 'How much do you know about animals?',
    difficulty: 'easy', grade: '2', durationMinutes: 8, passingScore: 60, xpReward: 110, icon: '🦁',
    questions: [
      { text: 'Which animal is called the "King of the Jungle"?', type: 'mcq', options: ['Tiger', 'Lion', 'Elephant', 'Leopard'], correctAnswer: 'Lion', explanation: 'The Lion 🦁 is the King of the Jungle!', points: 20 },
      { text: 'Which is a domestic animal?', type: 'mcq', options: ['Tiger', 'Zebra', 'Dog', 'Cheetah'], correctAnswer: 'Dog', explanation: 'Dog 🐕 is a domestic animal!', points: 20 },
      { text: 'What is the largest land animal?', type: 'mcq', options: ['Giraffe', 'Rhinoceros', 'Elephant', 'Hippo'], correctAnswer: 'Elephant', explanation: 'The African Elephant 🐘 is the largest land animal!', points: 20 },
      { text: 'Which bird can swim but cannot fly?', type: 'mcq', options: ['Parrot', 'Penguin', 'Eagle', 'Sparrow'], correctAnswer: 'Penguin', explanation: 'Penguins 🐧 cannot fly!', points: 20 },
      { text: 'A caterpillar turns into a _______.', type: 'mcq', options: ['Bee', 'Moth', 'Butterfly', 'Dragonfly'], correctAnswer: 'Butterfly', explanation: 'Caterpillars transform into butterflies 🦋!', points: 20 },
    ],
  },
  {
    topicId: topicMap['Our Country India'], subjectId: subjectMap['General Knowledge'],
    title: 'Know Your India!', description: 'Test your knowledge about India!',
    difficulty: 'medium', grade: '3', durationMinutes: 10, passingScore: 60, xpReward: 140, icon: '🇮🇳',
    questions: [
      { text: 'What is the capital of India?', type: 'mcq', options: ['Mumbai', 'Kolkata', 'New Delhi', 'Chennai'], correctAnswer: 'New Delhi', explanation: 'New Delhi is the capital of India!', points: 20 },
      { text: 'What is the national bird of India?', type: 'mcq', options: ['Sparrow', 'Eagle', 'Peacock', 'Flamingo'], correctAnswer: 'Peacock', explanation: 'The Peacock 🦚 is the national bird!', points: 20 },
      { text: 'India has how many states?', type: 'mcq', options: ['25', '26', '27', '28'], correctAnswer: '28', explanation: 'India has 28 states!', points: 20 },
      { text: 'What is the national fruit of India?', type: 'mcq', options: ['Apple', 'Mango', 'Banana', 'Orange'], correctAnswer: 'Mango', explanation: 'The Mango 🥭 is the national fruit!', points: 20 },
      { text: 'The national animal of India is the _______?', type: 'mcq', options: ['Lion', 'Elephant', 'Tiger', 'Deer'], correctAnswer: 'Tiger', explanation: 'The Bengal Tiger 🐅 is the national animal!', points: 20 },
    ],
  },
  {
    topicId: topicMap['Space & Universe'], subjectId: subjectMap['General Knowledge'],
    title: 'Space Explorer Quiz', description: 'Journey through our solar system!',
    difficulty: 'medium', grade: '4', durationMinutes: 10, passingScore: 60, xpReward: 160, icon: '🪐',
    questions: [
      { text: 'How many planets are in our solar system?', type: 'mcq', options: ['7', '8', '9', '10'], correctAnswer: '8', explanation: 'There are 8 planets!', points: 20 },
      { text: 'Which is the largest planet?', type: 'mcq', options: ['Saturn', 'Uranus', 'Jupiter', 'Neptune'], correctAnswer: 'Jupiter', explanation: 'Jupiter 🪐 is the largest planet!', points: 20 },
      { text: 'Which planet is closest to the Sun?', type: 'mcq', options: ['Venus', 'Earth', 'Mercury', 'Mars'], correctAnswer: 'Mercury', explanation: 'Mercury is closest to the Sun!', points: 20 },
      { text: "Earth's natural satellite is called?", type: 'mcq', options: ['Sun', 'Mars', 'Star', 'Moon'], correctAnswer: 'Moon', explanation: 'The Moon 🌙 is our natural satellite!', points: 20 },
      { text: 'Which planet has rings around it?', type: 'mcq', options: ['Jupiter', 'Saturn', 'Mars', 'Venus'], correctAnswer: 'Saturn', explanation: 'Saturn 🪐 has beautiful rings!', points: 20 },
    ],
  },
]

/* ─── Main seed function ───────────────────────────────────────────────────── */
async function seed() {
  await connectDB()

  console.log('🗑  Clearing existing content...')
  await Promise.all([
    Subject.deleteMany({}),
    Topic.deleteMany({}),
    Lesson.deleteMany({}),
    Quiz.deleteMany({}),
  ])

  // 1. Insert subjects
  console.log('🌱 Seeding subjects...')
  const insertedSubjects = await Subject.insertMany(subjectsData)
  const subjectMap = {}
  insertedSubjects.forEach(s => { subjectMap[s.name] = s._id })

  // 2. Insert topics
  console.log('🌱 Seeding topics...')
  const insertedTopics = await Topic.insertMany(topicsData(subjectMap))
  const topicMap = {}
  insertedTopics.forEach(t => { topicMap[t.name] = t._id })

  // 3. Insert lessons
  console.log('🌱 Seeding lessons...')
  await Lesson.insertMany(lessonsData(topicMap, subjectMap))

  // 4. Insert quizzes
  console.log('🌱 Seeding quizzes...')
  await Quiz.insertMany(quizzesData(topicMap, subjectMap))

  // 5. Ensure default admin exists (upsert — safe to re-run)
  console.log('🌱 Ensuring default admin user...')
  const adminEmail = 'admin@olympquiz.com'
  const existing   = await User.findOne({ email: adminEmail })
  if (!existing) {
    await User.create({
      name:     'Admin',
      email:    adminEmail,
      password: 'Admin@123',
      role:     'admin',
    })
    console.log('   ✅ Admin created  →  email: admin@olympquiz.com  |  password: Admin@123')
  } else {
    console.log('   ℹ️  Admin already exists — skipping')
  }

  console.log('\n✅ Seed complete!')
  console.log(`   Subjects: ${insertedSubjects.length}`)
  console.log(`   Topics:   ${insertedTopics.length}`)
  console.log(`   Lessons:  ${lessonsData(topicMap, subjectMap).length}`)
  console.log(`   Quizzes:  ${quizzesData(topicMap, subjectMap).length}`)

  process.exit(0)
}

seed().catch(err => {
  console.error('❌ Seed failed:', err)
  process.exit(1)
})
