const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { saveUserToExcel } = require('../utils/excelManager');


const generateToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });



const register = async (req, res, next) => {
  try {

    const {
      username,
      password,
      name,
      panchayat,
      village,
      taluka,
      district,
      // ✅ NEW: कर आकारणी वर्ष (Assessment Year) captured on Register page.
      assessmentYear,
    } = req.body;


    const existingUser = await User.findOne({
      username: username.toLowerCase()
    });


    if (existingUser) {
      return next(
        new AppError('Username already exists', 400)
      );
    }


    const user = await User.create({

      username,

      password,

      name: name || username,

      gramPanchayatName: panchayat || '',

      village: village || '',

      taluka: taluka || '',

      district: district || '',

      // ✅ NEW: save assessmentYear on the User model
      assessmentYear: assessmentYear || '',

      role: 'user',

    });



    // Save user data into Excel
    saveUserToExcel(user);



    res.status(201).json({

      success: true,

      message: 'Registration successful',

      data: user.toPublicJSON(),

    });


  } catch (error) {

    next(error);

  }

};






const login = async (req, res, next) => {

  try {

    const {
      username,
      password
    } = req.body;



    const user = await User.findOne({
      username: username.toLowerCase()
    }).select('+password');



    if (
      !user ||
      !(await user.comparePassword(password))
    ) {

      return next(
        new AppError('Invalid username or password', 401)
      );

    }



    const token = generateToken(user._id);



    res.status(200).json({

      success: true,

      message: 'Login successful',

      token,

      data: user.toPublicJSON(),

    });



  } catch (error) {

    next(error);

  }

};






const getRegisteredUsers = async (req, res, next) => {

  try {

    // ✅ This route is already gated by `protect, adminOnly` in
    // authRoutes.js, so req.user.role === 'admin' is guaranteed here.
    const users = await User.find({
      role: 'user'
    })
    .sort({
      createdAt:-1
    });



    res.status(200).json({

      success:true,

      count:users.length,

      data:users.map(
        (u)=>u.toPublicJSON()
      )

    });


  } catch(error){

    next(error);

  }

};






const getMe = async (req,res,next)=>{

  try{


    res.status(200).json({

      success:true,

      data:req.user.toPublicJSON()

    });



  }catch(error){

    next(error);

  }

};




// ✅ NEW: Reset Password for Admin
const resetPassword = async (req, res, next) => {
  try {
    const { username, newPassword } = req.body;

    // Validate input
    if (!username || !newPassword) {
      return next(new AppError('Username and new password are required', 400));
    }

    if (newPassword.length < 6) {
      return next(new AppError('Password must be at least 6 characters', 400));
    }

    // Find user
    const user = await User.findOne({
      username: username.toLowerCase()
    });

    if (!user) {
      return next(new AppError('User not found', 404));
    }

    // Update password
    user.password = newPassword;
    await user.save();

    console.log(`✅ Password reset for user: ${username}`);

    res.status(200).json({
      success: true,
      message: `Password reset successfully for ${username}`,
      data: {
        username: user.username,
        name: user.name
      }
    });

  } catch (error) {
    next(error);
  }
};




// ✅ NEW: Self-service Change Password (requires knowing the current password)
// Used from the Register page / any logged-out or logged-in user who wants
// to change their own password. Unlike resetPassword (admin-only, no old
// password required), this verifies the current password first.
const changePassword = async (req, res, next) => {
  try {
    const { username, oldPassword, newPassword } = req.body;

    if (!username || !oldPassword || !newPassword) {
      return next(
        new AppError('Username, current password आणि new password आवश्यक आहेत', 400)
      );
    }

    if (newPassword.length < 6) {
      return next(new AppError('New password किमान 6 अक्षरांचा असावा', 400));
    }

    const user = await User.findOne({
      username: username.toLowerCase(),
    }).select('+password');

    if (!user) {
      return next(new AppError('User सापडला नाही', 404));
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      return next(new AppError('सध्याचा Password चुकीचा आहे', 401));
    }

    user.password = newPassword;
    await user.save();

    console.log(`✅ Password changed by user: ${username}`);

    res.status(200).json({
      success: true,
      message: 'Password यशस्वीरित्या बदलला गेला',
      data: {
        username: user.username,
        name: user.name,
      },
    });
  } catch (error) {
    next(error);
  }
};




const seedAdmin = async ()=>{


  const adminUsername =
    process.env.ADMIN_USERNAME || 'admin';


  const adminPassword =
    process.env.ADMIN_PASSWORD || 'admin123';




  const existing =
    await User.findOne({
      username:adminUsername
    });



  if(existing) return;




  const admin = await User.create({

    username:adminUsername,

    password:adminPassword,

    name:'Admin',

    role:'admin'

  });



  // Save admin also in Excel
  saveUserToExcel(admin);



  console.log(
    `Default admin user created: ${adminUsername}`
  );


};




module.exports = {

  register,

  login,

  getRegisteredUsers,

  getMe,

  seedAdmin,

  resetPassword,

  changePassword,

};