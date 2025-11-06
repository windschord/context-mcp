#!/usr/bin/env ts-node
/**
 * 大規模サンプルプロジェクト生成スクリプト
 * 10,000ファイルを含むテストプロジェクトを生成します
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface GeneratorConfig {
  outputDir: string;
  totalFiles: number;
  languages: {
    typescript: number;
    python: number;
    go: number;
    rust: number;
    java: number;
    cpp: number;
  };
  filesPerDirectory: number;
}

const config: GeneratorConfig = {
  outputDir: path.join(__dirname, '../fixtures/large-project'),
  totalFiles: 10000,
  languages: {
    typescript: 0.3, // 30%
    python: 0.25, // 25%
    go: 0.15, // 15%
    rust: 0.15, // 15%
    java: 0.1, // 10%
    cpp: 0.05, // 5%
  },
  filesPerDirectory: 50,
};

// コード生成テンプレート
const codeTemplates = {
  typescript: (index: number, funcCount: number) => `
/**
 * TypeScript module ${index}
 * Generated for performance testing
 */

export interface User${index} {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}

export class UserService${index} {
  private users: Map<number, User${index}> = new Map();

  constructor() {
    this.initializeUsers();
  }

  private initializeUsers(): void {
    for (let i = 0; i < 100; i++) {
      this.users.set(i, {
        id: i,
        name: \`User\${i}\`,
        email: \`user\${i}@example.com\`,
        createdAt: new Date(),
      });
    }
  }

${Array.from(
  { length: funcCount },
  (_, i) => `
  public getUser${i}(id: number): User${index} | undefined {
    return this.users.get(id);
  }

  public updateUser${i}(id: number, data: Partial<User${index}>): boolean {
    const user = this.users.get(id);
    if (!user) {
      return false;
    }
    this.users.set(id, { ...user, ...data });
    return true;
  }
`
).join('\n')}

  public getAllUsers(): User${index}[] {
    return Array.from(this.users.values());
  }
}

export default UserService${index};
`,

  python: (index: number, funcCount: number) => `
"""
Python module ${index}
Generated for performance testing
"""

from typing import List, Dict, Optional
from datetime import datetime

class User${index}:
    """User data model"""

    def __init__(self, id: int, name: str, email: str):
        self.id = id
        self.name = name
        self.email = email
        self.created_at = datetime.now()

    def to_dict(self) -> Dict:
        """Convert user to dictionary"""
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'created_at': self.created_at.isoformat()
        }

class UserService${index}:
    """User management service"""

    def __init__(self):
        self.users: Dict[int, User${index}] = {}
        self._initialize_users()

    def _initialize_users(self):
        """Initialize sample users"""
        for i in range(100):
            self.users[i] = User${index}(i, f'User{i}', f'user{i}@example.com')

${Array.from(
  { length: funcCount },
  (_, i) => `
    def get_user_${i}(self, user_id: int) -> Optional[User${index}]:
        """Get user by ID"""
        return self.users.get(user_id)

    def update_user_${i}(self, user_id: int, **kwargs) -> bool:
        """Update user data"""
        user = self.users.get(user_id)
        if not user:
            return False
        for key, value in kwargs.items():
            setattr(user, key, value)
        return True
`
).join('\n')}

    def get_all_users(self) -> List[User${index}]:
        """Get all users"""
        return list(self.users.values())
`,

  go: (index: number, funcCount: number) => `
// Package module${index} - Generated for performance testing
package module${index}

import (
    "fmt"
    "time"
)

// User${index} represents a user entity
type User${index} struct {
    ID        int       \`json:"id"\`
    Name      string    \`json:"name"\`
    Email     string    \`json:"email"\`
    CreatedAt time.Time \`json:"created_at"\`
}

// UserService${index} manages user operations
type UserService${index} struct {
    users map[int]*User${index}
}

// NewUserService${index} creates a new user service
func NewUserService${index}() *UserService${index} {
    s := &UserService${index}{
        users: make(map[int]*User${index}),
    }
    s.initializeUsers()
    return s
}

func (s *UserService${index}) initializeUsers() {
    for i := 0; i < 100; i++ {
        s.users[i] = &User${index}{
            ID:        i,
            Name:      fmt.Sprintf("User%d", i),
            Email:     fmt.Sprintf("user%d@example.com", i),
            CreatedAt: time.Now(),
        }
    }
}

${Array.from(
  { length: funcCount },
  (_, i) => `
// GetUser${i} retrieves a user by ID
func (s *UserService${index}) GetUser${i}(id int) (*User${index}, bool) {
    user, ok := s.users[id]
    return user, ok
}

// UpdateUser${i} updates user data
func (s *UserService${index}) UpdateUser${i}(id int, name, email string) bool {
    user, ok := s.users[id]
    if !ok {
        return false
    }
    if name != "" {
        user.Name = name
    }
    if email != "" {
        user.Email = email
    }
    return true
}
`
).join('\n')}

// GetAllUsers returns all users
func (s *UserService${index}) GetAllUsers() []*User${index} {
    users := make([]*User${index}, 0, len(s.users))
    for _, user := range s.users {
        users = append(users, user)
    }
    return users
}
`,

  rust: (index: number, funcCount: number) => `
//! Rust module ${index}
//! Generated for performance testing

use std::collections::HashMap;
use chrono::{DateTime, Utc};

/// User${index} represents a user entity
#[derive(Debug, Clone)]
pub struct User${index} {
    pub id: i32,
    pub name: String,
    pub email: String,
    pub created_at: DateTime<Utc>,
}

/// UserService${index} manages user operations
pub struct UserService${index} {
    users: HashMap<i32, User${index}>,
}

impl UserService${index} {
    /// Create a new user service
    pub fn new() -> Self {
        let mut service = Self {
            users: HashMap::new(),
        };
        service.initialize_users();
        service
    }

    fn initialize_users(&mut self) {
        for i in 0..100 {
            self.users.insert(i, User${index} {
                id: i,
                name: format!("User{}", i),
                email: format!("user{}@example.com", i),
                created_at: Utc::now(),
            });
        }
    }

${Array.from(
  { length: funcCount },
  (_, i) => `
    /// Get user by ID
    pub fn get_user_${i}(&self, id: i32) -> Option<&User${index}> {
        self.users.get(&id)
    }

    /// Update user data
    pub fn update_user_${i}(&mut self, id: i32, name: String, email: String) -> bool {
        if let Some(user) = self.users.get_mut(&id) {
            user.name = name;
            user.email = email;
            true
        } else {
            false
        }
    }
`
).join('\n')}

    /// Get all users
    pub fn get_all_users(&self) -> Vec<&User${index}> {
        self.users.values().collect()
    }
}
`,

  java: (index: number, funcCount: number) => `
/**
 * Java module ${index}
 * Generated for performance testing
 */
package com.example.module${index};

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.Date;

/**
 * User${index} represents a user entity
 */
public class User${index} {
    private int id;
    private String name;
    private String email;
    private Date createdAt;

    public User${index}(int id, String name, String email) {
        this.id = id;
        this.name = name;
        this.email = email;
        this.createdAt = new Date();
    }

    public int getId() { return id; }
    public String getName() { return name; }
    public String getEmail() { return email; }
    public Date getCreatedAt() { return createdAt; }

    public void setName(String name) { this.name = name; }
    public void setEmail(String email) { this.email = email; }
}

/**
 * UserService${index} manages user operations
 */
public class UserService${index} {
    private Map<Integer, User${index}> users = new HashMap<>();

    public UserService${index}() {
        initializeUsers();
    }

    private void initializeUsers() {
        for (int i = 0; i < 100; i++) {
            users.put(i, new User${index}(i, "User" + i, "user" + i + "@example.com"));
        }
    }

${Array.from(
  { length: funcCount },
  (_, i) => `
    /**
     * Get user by ID
     */
    public User${index} getUser${i}(int id) {
        return users.get(id);
    }

    /**
     * Update user data
     */
    public boolean updateUser${i}(int id, String name, String email) {
        User${index} user = users.get(id);
        if (user == null) {
            return false;
        }
        if (name != null) user.setName(name);
        if (email != null) user.setEmail(email);
        return true;
    }
`
).join('\n')}

    /**
     * Get all users
     */
    public List<User${index}> getAllUsers() {
        return new ArrayList<>(users.values());
    }
}
`,

  cpp: (index: number, funcCount: number) => `
/**
 * C++ module ${index}
 * Generated for performance testing
 */

#include <string>
#include <map>
#include <vector>
#include <ctime>

namespace module${index} {

/**
 * User${index} represents a user entity
 */
class User${index} {
private:
    int id;
    std::string name;
    std::string email;
    std::time_t created_at;

public:
    User${index}(int id, const std::string& name, const std::string& email)
        : id(id), name(name), email(email), created_at(std::time(nullptr)) {}

    int getId() const { return id; }
    const std::string& getName() const { return name; }
    const std::string& getEmail() const { return email; }
    std::time_t getCreatedAt() const { return created_at; }

    void setName(const std::string& newName) { name = newName; }
    void setEmail(const std::string& newEmail) { email = newEmail; }
};

/**
 * UserService${index} manages user operations
 */
class UserService${index} {
private:
    std::map<int, User${index}*> users;

    void initializeUsers() {
        for (int i = 0; i < 100; i++) {
            users[i] = new User${index}(i, "User" + std::to_string(i),
                                       "user" + std::to_string(i) + "@example.com");
        }
    }

public:
    UserService${index}() {
        initializeUsers();
    }

    ~UserService${index}() {
        for (auto& pair : users) {
            delete pair.second;
        }
    }

${Array.from(
  { length: funcCount },
  (_, i) => `
    /**
     * Get user by ID
     */
    User${index}* getUser${i}(int id) {
        auto it = users.find(id);
        return (it != users.end()) ? it->second : nullptr;
    }

    /**
     * Update user data
     */
    bool updateUser${i}(int id, const std::string& name, const std::string& email) {
        auto it = users.find(id);
        if (it == users.end()) {
            return false;
        }
        if (!name.empty()) it->second->setName(name);
        if (!email.empty()) it->second->setEmail(email);
        return true;
    }
`
).join('\n')}

    /**
     * Get all users
     */
    std::vector<User${index}*> getAllUsers() {
        std::vector<User${index}*> result;
        for (auto& pair : users) {
            result.push_back(pair.second);
        }
        return result;
    }
};

} // namespace module${index}
`,
};

function getFileExtension(language: string): string {
  const extensions: Record<string, string> = {
    typescript: 'ts',
    python: 'py',
    go: 'go',
    rust: 'rs',
    java: 'java',
    cpp: 'cpp',
  };
  return extensions[language] || 'txt';
}

function generateFile(language: string, index: number, funcCount: number): string {
  const generator = codeTemplates[language as keyof typeof codeTemplates];
  if (!generator) {
    throw new Error(`Unknown language: ${language}`);
  }
  return generator(index, funcCount);
}

async function generateProject(): Promise<void> {
  console.log('🚀 Starting large project generation...');
  console.log(`📁 Output directory: ${config.outputDir}`);
  console.log(`📊 Total files: ${config.totalFiles}`);

  // Clean and create output directory
  if (fs.existsSync(config.outputDir)) {
    console.log('🗑️  Cleaning existing directory...');
    fs.rmSync(config.outputDir, { recursive: true });
  }
  fs.mkdirSync(config.outputDir, { recursive: true });

  // Calculate file distribution
  const distribution: Record<string, number> = {};
  let totalAllocated = 0;

  for (const [lang, ratio] of Object.entries(config.languages)) {
    const count = Math.floor(config.totalFiles * ratio);
    distribution[lang] = count;
    totalAllocated += count;
  }

  // Allocate remaining files to TypeScript
  if (totalAllocated < config.totalFiles) {
    distribution.typescript += config.totalFiles - totalAllocated;
  }

  console.log('📈 File distribution:', distribution);

  let filesGenerated = 0;
  const startTime = Date.now();

  // Generate files for each language
  for (const [language, count] of Object.entries(distribution)) {
    console.log(`\n📝 Generating ${count} ${language} files...`);

    const langDir = path.join(config.outputDir, language);
    fs.mkdirSync(langDir, { recursive: true });

    const dirsNeeded = Math.ceil(count / config.filesPerDirectory);

    for (let dirIndex = 0; dirIndex < dirsNeeded; dirIndex++) {
      const subDir = path.join(langDir, `module${dirIndex}`);
      fs.mkdirSync(subDir, { recursive: true });

      const filesInThisDir = Math.min(
        config.filesPerDirectory,
        count - dirIndex * config.filesPerDirectory
      );

      for (let fileIndex = 0; fileIndex < filesInThisDir; fileIndex++) {
        const globalIndex = dirIndex * config.filesPerDirectory + fileIndex;
        const funcCount = 3 + (globalIndex % 5); // 3-7 functions per file

        const content = generateFile(language, globalIndex, funcCount);
        const ext = getFileExtension(language);
        const fileName = `${language}_${globalIndex}.${ext}`;
        const filePath = path.join(subDir, fileName);

        fs.writeFileSync(filePath, content, 'utf-8');
        filesGenerated++;

        if (filesGenerated % 1000 === 0) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`  ✅ Generated ${filesGenerated}/${config.totalFiles} files (${elapsed}s)`);
        }
      }
    }
  }

  // Generate README
  const readme = `# Large Test Project

This is an automatically generated test project for performance testing.

## Statistics

- **Total Files**: ${filesGenerated}
- **Languages**: ${Object.keys(distribution).length}
- **File Distribution**:
${Object.entries(distribution)
  .map(([lang, count]) => `  - ${lang}: ${count} files`)
  .join('\n')}

## Generated on

${new Date().toISOString()}

## Purpose

This project is used for:
- Indexing performance testing
- Search performance testing
- Memory usage analysis
- Scalability testing
`;

  fs.writeFileSync(path.join(config.outputDir, 'README.md'), readme, 'utf-8');

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Project generation completed!`);
  console.log(`📊 Total files generated: ${filesGenerated}`);
  console.log(`⏱️  Time taken: ${totalTime}s`);
  console.log(`📁 Output directory: ${config.outputDir}`);
}

// Execute if run directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  generateProject()
    .then(() => {
      console.log('\n🎉 Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Error:', error);
      process.exit(1);
    });
}

export { generateProject, config as generatorConfig };
