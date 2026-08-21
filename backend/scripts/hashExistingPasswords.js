/**
 * This script updates all existing plaintext passwords in the database to bcrypt hashed versions
 * Run this script once after implementing password hashing
 */

require('dotenv').config();
const { query } = require('../db');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function hashExistingPasswords() {
  console.log('Starting password hashing migration...');
  
  try {
    // Get all users
    const users = await query('SELECT id, password FROM users');
    console.log(`Found ${users.rows.length} users to update`);
    
    let successCount = 0;
    
    // Update each user's password with a hashed version
    for (const user of users.rows) {
      try {
        // Hash the plaintext password
        const hashedPassword = await bcrypt.hash(user.password, SALT_ROUNDS);
        
        // Update the user record
        await query(
          'UPDATE users SET password = $1 WHERE id = $2',
          [hashedPassword, user.id]
        );
        
        successCount++;
      } catch (err) {
        console.error(`Failed to update user ${user.id}:`, err.message);
      }
    }
    
    console.log(`Successfully updated ${successCount} out of ${users.rows.length} passwords`);
    console.log('Password hashing migration completed!');
  } catch (err) {
    console.error('Migration failed:', err.message);
  } finally {
    process.exit(0);
  }
}

// Run the migration
hashExistingPasswords();