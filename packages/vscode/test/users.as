type TCryptoAlgorithm = 'md5' | 'sha224' | 'sha256' | 'sha384' | 'sha512' | 'sha3-224' | 'sha3-256' | 'sha3-384' | 'sha3-512'

type TUser = [string | number ]

type TArray = string[][]

type TTT = {
    @label 'aaa'
    abc: string
}

@mongo.collection '2332'
@label 'true'
export interface User2 {
    @label 'User "ID"'
    @mongo.key 'ObjectId'
    _id: (string[] | '123') & {
        ppp: int,
    }

    array2: string[][]

    array3: [string, string][][][]

    @label 'true'
    @dummy 'test'
    @mongo.uniqueIndex "ema'il" 
    @mongo.index 'someIndex', true
    @description "Unique user email"
    id: string
    
    bool: true
    bool2: false,
    number: 123123 | false
    
    test: string
    
    aaa: TCryptoAlgorithm

    @label "User Name (public)"
    @mongo.uniqueIndex "userid"
    @mongo.textIndex
    @description "Unique ID that can be used for login"
    username: string

    t2: string

    password: {
        @label "Password Hash"
        hash: string[]

        @label "Password Salt"
        salt: string

        @label "Encryption Algorithm"
        algorithm: TCryptoAlgorithm

        history: {
            @label "Encryption Algorithm"
            algorithm: TCryptoAlgorithm

            @label "Password Hash"
            hash: string            
        }

        @label "Last Changed"
        lastChanged: number

        @label "Is Initial"
        isInitial: boolean        
    },
  
    account: {
        @label "Is user \"", 
        active: boolean

        @label "Is Locked"
        locked: boolean

        @label "Lock Reason"
        lockReason: string

        @label "Lock End Timestamp"
        lockEnds: number

        @label "Failed Login Attempts"
        failedLoginAttempts: number

        @label "Last Login"
        lastLogin: number        
    }
  
    mfa: {
        email: {
            @label "Email Address"
            address: string

            @label "Email Confirmed"
            confirmed: boolean            
        }

        sms: {
            @label "Phone Confirmed"
            confirmed: boolean

            @label "Phone Number"
            number: string            
        }

        @label "Default Method"
        default: '' | 'sms' | 'email' | 'totp'

        @label "Enable Auto-send"
        autoSend: boolean        
    }

    requiredProp: string,
    optionalProp?: string,
    
    @label "First Name"
    @mongo.textIndex
    firstName?: string
  
    @label "Last Name"
    @mongo.textIndex
    lastName?: string
  
    @label "Assigned Dealers"
    dealers: string[]
  
    @label "Assigned Roles"
    roles: string[]
}
