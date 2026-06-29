const mongoose = require('mongoose')

/*
 * Question types supported:
 *  mcq         – Multiple choice (single correct)
 *  truefalse   – True / False
 *  fillinblank – Fill in the blank  (correctAnswer is the expected word/phrase)
 *  matching    – Match pairs  (pairs: [{left, right}], correctAnswer unused)
 *  sequence    – Put items in correct order (items[], correctOrder[])
 *  imagemcq    – MCQ with an image prompt (imageUrl required)
 *  oddoneout   – Pick the odd one from options
 *  flashcard   – Front/back card (text = front, correctAnswer = back)
 */
const questionSchema = new mongoose.Schema({
  text:          { type: String, required: true },
  type: {
    type: String,
    enum: ['mcq','truefalse','fillinblank','matching','sequence','imagemcq','oddoneout','flashcard'],
    default: 'mcq',
  },
  imageUrl:      { type: String },                  // imagemcq
  options:       [{ type: String }],                // mcq / oddoneout / imagemcq
  correctAnswer: { type: String },                  // mcq / truefalse / fillinblank / oddoneout
  pairs: [{                                         // matching
    left:  { type: String },
    right: { type: String },
  }],
  items:         [{ type: String }],                // sequence – displayed order
  correctOrder:  [{ type: String }],                // sequence – correct order
  explanation:   { type: String },
  points:        { type: Number, default: 20 },
})

const quizSchema = new mongoose.Schema(
  {
    topicId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Topic' },
    subjectId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    title:           { type: String, required: true, trim: true },
    description:     { type: String },
    quizType:        { type: String, enum: ['test','flashcard','practice'], default: 'test' },
    difficulty:      { type: String, enum: ['easy', 'medium', 'hard'], default: 'easy' },
    grade:           { type: String },
    durationMinutes: { type: Number, default: 10 },
    passingScore:    { type: Number, default: 60 },
    xpReward:        { type: Number, default: 100 },
    icon:            { type: String, default: '📝' },
    questions:       [questionSchema],
    createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive:        { type: Boolean, default: true },
    assignedTo:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    assignedGrades:  [{ type: String }],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
)

quizSchema.virtual('totalQuestions').get(function () {
  return this.questions.length
})

quizSchema.index({ subjectId: 1, difficulty: 1 })
quizSchema.index({ topicId: 1, subjectId: 1 })

module.exports = mongoose.model('Quiz', quizSchema)
