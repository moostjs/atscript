

@label "First Name"
type TFirstName = string;

@label "Last Name"
type TLastName = string;

@min 18
type TAge = number;


export interface ITarget {
    firstName: TFirstName

    @label "Last Name (optional)"
    @required false
    lastName?: TLastName

    age: TAge
}