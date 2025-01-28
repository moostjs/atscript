interface ISource {

    @label "First Name"
    firstName: string;

    @label "Last Name"
    lastName: string;

    @min 18
    age: number;

}

export interface ITarget {
    firstName: ISource.firstName

    @label "Last Name (optional)"
    @required false
    lastName?: ISource.lastName
    age: ISource.age
}