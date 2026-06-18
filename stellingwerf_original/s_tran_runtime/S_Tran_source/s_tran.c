/*  s_tran.c   --  S language translator driver  */
/*  $Id $  */

/**************************************************************************
*            SSSSSS      TTTTTTT  RRRRRR       A       N    N             *
*            S              T     R     R     A A      NN   N             *
*            SSSSSS  ====   T     RRRRRR     AAAAA     N N  N             *
*                 S         T     R   R     A     A    N  N N             *
*            SSSSSS         T     R    R   A       A   N    N             *
**************************************************************************/

/*============================================================*
 *    S_TRAN - Copyright (c) 2005, Stellingwerf Consulting    *
 *    All rights reserved, Use under license agreement only.  *
 *============================================================*/

/*  Stellingwerf  --  11/2003   */

#define EXTERN
#include "s_tran.h"

/*--------------------------------------------------------
main() - driver
    called by system
    calls     read_data_file()
----------------------------------------------------------*/


int main( int argc, char *argv[] )
{
    int i;
    static char label[2];
	FILE *fp;
                                                /*  set defaults  */
    column_width = 12;
    decimals = -1;

                                                /*  process arg list  */
    if( argc == 2 ) {
        strcpy( input_file, argv[1] );

        printf("S Language Translator - Version %.2f\n", VERSION);

        /*  extract path name from "clicked" icon input  */
        strcpy( stmp, input_file );
        for( i = strlen( stmp ); i >= 1; i-- ) {
            if( stmp[i] == '\\' || stmp[i] == '/' ) {
                stmp[i+1] = '\0';
                strcpy( path_name, stmp );
                break;
            }
        }
        /*  this handles the case of cd'ing to a directory  */
        if( !i )  path_name[0] = '\0';
    }
    else {
		fp = fopen( "code.s", "r" );
		if( !fp ) {
            printf( "S Language Translator - Version %.2f\n", VERSION );
			printf( "\n-->No source file found on command line<--\n\n" );
            do_exit(2);
		}
		else {
			fclose( fp );
			strcpy( input_file, "code.s" );
			strcpy( path_name, "" );
		}

    }

    label[0] = '\0';

    read_input_file( input_file, process_cmds, label );

    do_exit(2);

    return(1);
}
