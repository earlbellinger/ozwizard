/*------------------------------------------------------------------------
  ascdate.c --obtains current date and time from system, returns a pointer
  to a string containing printable format for date and time.

  ANSI version

  also includes  dec_date()  and cindex()
  ------------------------------------------------------------------------*/
/*  $Id: ascdate.c,v 6.2 2002/03/04 16:34:06 rfs Exp $  */

/*=========================================================*
*  SPHC - Copyright (c) 2000-2005, Stellingwerf Consulting *
*  All rights reserved, Use under license agreement only.  *
===========================================================*/

#include <stdio.h>
#include <time.h>
#include <string.h>
#include <stdlib.h>
#include <ctype.h>

char *ascdate( void );
double dec_date( char *date_str );
int cindex( char *string, char *key );

char *ascdate()
{
    extern char *asctime();
    time_t now;
    struct tm *t;
    char *stmp;
    static char str[20];

    now = time( NULL );
    t = localtime( &now );
    stmp = asctime( t );
                                                /*  reformat  */
    str[0] = '\0';
    strncat( str, stmp+10, 9 );                 /*  time  */
    strncat( str, stmp+7, 3 );                  /*  day  */
    strncat( str, stmp+3, 4 );                  /*  month  */
    strncat( str, stmp+19, 5 );                 /*  year  */

    return( str );
}


double dec_date( char *date_str ) /*---- translate date string into decimal year  */
                            /*     average over leap years                  */
/*  valid formats:   m/d/y, y/m/d, m/d (use prev year), m/y (day = 1)       */

{
    int field1, field2, field3;
    static int year;
    int  month, day, num, sl, sl2;
                                                /*  decode string  */
    sl = cindex( date_str, "/" );
    if( sl == -1 )   return( -1 );

    field1 = atoi( date_str );
    field2 = atoi( date_str + sl + 1 );
    field3 = 0;

    sl2 = cindex( date_str + sl + 1, "/" );
    if( sl2 == -1 ) {
        num = 2;
    }
    else {
        num = 3;
        field3 = atoi( date_str + sl + sl2 + 2 );
    }
                                                /*  compute date  */
    if( num == 3 ) {
        if( field1 > 12 ) {
            year = field1;
            month = field2;
            day = field3;
        }
        else {
            month = field1;
            day = field2;
            year = field3;
        }
    }
    else {
        month = field1;
        if( field2 > 31 ) {
            day = 1;
            year = field2;
        }
        else {
            day = field2;
        }
    }
    return( year + (month - 1.) / 12. + (day - 1) / 365.25 );   
}


/*--------------- return position of key in string - return -1 if not found  */

int cindex( char *string, char *key )
{
    int i, j, k;

    if( *key == '\0' )  return( 0 );
    for( i = 0; string[i] != '\0'; i++ ) {
        for( j = i, k = 0; (key[k] != '\0') && 
            (toupper( string[j] ) == toupper( key[k]) ); j++, k++ )
            ;
        if( key[k] == '\0' )
            return(i);
    }
    return(-1);
}
